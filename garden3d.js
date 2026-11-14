/* Japantalk – 3D zen garden with 2D figures (HD-2D-like diorama).
   The world (ground, rocks, water, fence, forest, mountains, sky, light) is real 3D;
   the tree, companions, animals and Fluent decorations are flat pictures standing in it.
   A tilt-shift pass blurs the top and bottom of the picture, so it looks like a miniature. */
import * as THREE from "./lib/three.module.js";

const U = 25;                                   // 25 px of the 2D scene = 1 metre
const X = x => (x - 150) / U;
const Z = y => -3.7 + (y - 206) / 54 * 8;       // ground band y 206..260 -> z -3.7..4.3
const TAU = Math.PI * 2;

/* ---------- small helpers: noise, textures ---------- */
function hash(x, y, s){ const h = Math.sin(x*127.1 + y*311.7 + s*74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, s=0){ const xi=Math.floor(x), yi=Math.floor(y), xf=x-xi, yf=y-yi, u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
  const a=hash(xi,yi,s), b=hash(xi+1,yi,s), c=hash(xi,yi+1,s), d=hash(xi+1,yi+1,s); return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v; }
function fbm(x, y, s=0, o=4){ let f=0, a=.5, fr=1; for(let i=0;i<o;i++){ f+=a*vnoise(x*fr,y*fr,s+i*13); fr*=2; a*=.5; } return f; }
function tileNoise(n, scale, seed, oct){   // tileable fbm (blend at the borders)
  const out=new Float32Array(n*n);
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){ const u=x/n, v=y/n, s=scale;
    const a=fbm(u*s,v*s,seed,oct), b=fbm((u-1)*s,v*s,seed,oct), c=fbm(u*s,(v-1)*s,seed,oct), d=fbm((u-1)*s,(v-1)*s,seed,oct);
    out[y*n+x]=(a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v; }
  return out;
}
function canvasTex(c, srgb=true, rep=1){ const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rep,rep); if(srgb) t.colorSpace=THREE.SRGBColorSpace; t.anisotropy=4; return t; }
function grainTextures(n=256, scale=24, seed=3, strength=2.2){   // albedo variation + normal map for gravel
  const h=tileNoise(n, scale, seed, 3), h2=tileNoise(n, scale*3.3, seed+5, 2);
  const ca=document.createElement("canvas"), cn=document.createElement("canvas"); ca.width=ca.height=cn.width=cn.height=n;
  const A=ca.getContext("2d").createImageData(n,n), N=cn.getContext("2d").createImageData(n,n);
  const H=(x,y)=>{ x=(x+n)%n; y=(y+n)%n; return h[y*n+x]*.7+h2[y*n+x]*.5; };
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){ const i=(y*n+x)*4, v=H(x,y);
    const pebble = Math.pow(Math.max(0, h2[y*n+x]-.45)*2.2, 1.3);
    const g = 200 + v*55 - pebble*40; A.data[i]=g; A.data[i+1]=g*.985; A.data[i+2]=g*.95; A.data[i+3]=255;
    const dx=(H(x+1,y)-H(x-1,y))*strength, dy=(H(x,y+1)-H(x,y-1))*strength, l=Math.hypot(dx,dy,1);
    N.data[i]=(-dx/l*.5+.5)*255; N.data[i+1]=(dy/l*.5+.5)*255; N.data[i+2]=(1/l*.5+.5)*255; N.data[i+3]=255; }
  ca.getContext("2d").putImageData(A,0,0); cn.getContext("2d").putImageData(N,0,0);
  return [ca, cn];
}
const loadImg = src => new Promise((res, rej) => { const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; });

/* ---------- palettes per time of day ---------- */
const TOD = {
  morning: { top:"#9FC2E8", hor:"#FBD9C4", sun:[-7,4.2,4], sunC:"#FFD8B4", sunI:2.6, hemiS:"#CFE0F5", hemiG:"#E6D2BE", hemiI:1.1, fog:"#F4DCD0", exp:1.0, grade:[1.03,.99,.97] },
  day:     { top:"#6FA8E0", hor:"#E8F0EE", sun:[5,9,5],     sunC:"#FFF2DC", sunI:3.0, hemiS:"#CFE3F7", hemiG:"#E3D6C2", hemiI:1.2, fog:"#E6EEF0", exp:1.0, grade:[1,1,1] },
  evening: { top:"#6C74B8", hor:"#F7B38A", sun:[8,3.2,2.5],  sunC:"#FFBE88", sunI:2.4, hemiS:"#B4AEE0", hemiG:"#D9BBA8", hemiI:1.1, fog:"#EBB59C", exp:1.0, grade:[1.06,.97,.92] },
  night:   { top:"#141838", hor:"#3C4170", sun:[-5,8,4],     sunC:"#A8B8FF", sunI:.7, hemiS:"#3A4580", hemiG:"#2A2A40", hemiI:.55, fog:"#2A2E55", exp:1.1, grade:[.92,.96,1.1] },
};
const LEAF = { spring:["#B5DCA6","#8FC489"], summer:["#7FB77A","#5E9C5E"], autumn:["#EE9A72","#E9B85C"], winter:["#C2CCC6","#A9B5AE"] };

/* ---------- state ---------- */
let R=null;   // renderer bundle
function init(){
  const canvas=document.createElement("canvas"); canvas.className="g3d-canvas";
  canvas.style.cssText="width:100%;height:100%;display:block;touch-action:manipulation";
  const renderer=new THREE.WebGLRenderer({canvas, antialias:false, alpha:false, powerPreference:"high-performance"});
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(36, 300/260, .1, 200);
  camera.position.set(0, 6.4, 15.2); camera.lookAt(0, 2.5, -1.2);
  R={canvas, renderer, scene, camera, env:null, envKey:"", dyn:null, dynKey:"", host:null, t0:performance.now(), last:0,
     movers:[], tappables:[], decoObjs:[], onTap:null, onMove:null, edit:false, drag:null, post:makePost(renderer), water:null, motes:null, lanterns:[]};
  const ndc=ev=>{ const r=canvas.getBoundingClientRect(); return new THREE.Vector2((ev.clientX-r.left)/r.width*2-1, -((ev.clientY-r.top)/r.height*2-1)); };
  const groundAt=ev=>{ const ray=new THREE.Raycaster(); ray.setFromCamera(ndc(ev), camera); const p=new THREE.Vector3(); return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0), p) ? p : null; };
  canvas.addEventListener("pointerdown", ev=>{
    if(!R.edit) return; const ray=new THREE.Raycaster(); ray.setFromCamera(ndc(ev), camera);
    const hit=ray.intersectObjects(R.decoObjs.map(d=>d.obj), true)[0]; if(!hit) return;
    let o=hit.object; while(o && !o.userData.deco) o=o.parent; if(!o) return;
    const p=groundAt(ev); R.drag={obj:o, id:o.userData.deco, off:p?new THREE.Vector3(o.position.x-p.x,0,o.position.z-p.z):new THREE.Vector3()};
    o.position.y=.18; canvas.setPointerCapture(ev.pointerId); ev.preventDefault(); });
  canvas.addEventListener("pointermove", ev=>{ if(!R.drag) return; const p=groundAt(ev); if(!p) return;
    R.drag.obj.position.x=Math.max(-5.7,Math.min(5.7,p.x+R.drag.off.x)); R.drag.obj.position.z=Math.max(-3.6,Math.min(4.0,p.z+R.drag.off.z)); });
  const drop=()=>{ if(!R.drag) return; const o=R.drag.obj; o.position.y=0;
    const x=Math.round(150+o.position.x*U), y=Math.round(206+(o.position.z+3.7)*54/8);
    if(R.onMove) R.onMove(R.drag.id, Math.max(8,Math.min(292,x)), Math.max(207,Math.min(258,y))); R.drag=null; };
  canvas.addEventListener("pointerup", drop); canvas.addEventListener("pointercancel", drop);
  canvas.addEventListener("click", ev=>{ if(R.edit) return;
    const r=canvas.getBoundingClientRect(), p=new THREE.Vector2((ev.clientX-r.left)/r.width*2-1, -((ev.clientY-r.top)/r.height*2-1));
    const ray=new THREE.Raycaster(); ray.setFromCamera(p, camera);
    const hit=ray.intersectObjects(R.tappables, false)[0];
    if(hit && R.onTap) R.onTap(hit.object.userData.tap);
  });
  loop();
}

/* ---------- post: tilt-shift blur, vignette and colour ---------- */
function makePost(renderer){
  const mk=()=>new THREE.WebGLRenderTarget(4,4,{type:THREE.HalfFloatType, colorSpace:THREE.LinearSRGBColorSpace});
  const rtScene=mk(), rtA=mk(), rtB=mk();
  rtScene.depthTexture=new THREE.DepthTexture(4,4); rtScene.depthTexture.type=THREE.UnsignedIntType;
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2)); const qs=new THREE.Scene(); qs.add(quad); const qc=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const blur=new THREE.ShaderMaterial({ uniforms:{ tex:{value:null}, depth:{value:null}, dir:{value:new THREE.Vector2()}, near:{value:.1}, far:{value:200}, focus:{value:17.2} },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader:`uniform sampler2D tex; uniform sampler2D depth; uniform vec2 dir; uniform float near, far, focus; varying vec2 vUv;
      float lin(vec2 uv){ float z=texture2D(depth,uv).x*2.-1.; return 2.*near*far/(far+near-z*(far-near)); }
      float coc(vec2 uv){ float d=lin(uv); return d<focus ? clamp((focus-5.5-d)/2.2,0.,1.)*1.6 : clamp((d-focus-3.)/10.,0.,1.); }
      void main(){ float k=coc(vUv); float nearF=step(lin(vUv),focus-5.5);
        vec4 c=vec4(0.); float w=0.;
        for(int i=-6;i<=6;i++){ float fi=float(i); vec2 uv=vUv+dir*fi*k*1.9; float kk=coc(uv); float g=exp(-fi*fi/18.)*(i==0?1.:mix(max(kk,.15),1.,nearF));
          c+=texture2D(tex, uv)*g; w+=g; }
        gl_FragColor=c/w; }`, depthTest:false, depthWrite:false });
  const final=new THREE.ShaderMaterial({ uniforms:{ tex:{value:null}, grade:{value:new THREE.Vector3(1,1,1)}, exposure:{value:1} },
    vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader:`uniform sampler2D tex; uniform vec3 grade; uniform float exposure; varying vec2 vUv;
      vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.); }
      void main(){ vec3 c=texture2D(tex,vUv).rgb*exposure*grade;
        /* soft bloom from the neighbourhood */
        vec3 b=vec3(0.); for(int i=0;i<8;i++){ float a=float(i)*.785; b+=max(texture2D(tex,vUv+vec2(cos(a),sin(a))*.012).rgb-.8,0.); }
        c+=b*.09;
        c=aces(c);
        float l=dot(c,vec3(.299,.587,.114)); c=mix(vec3(l),c,1.08);
        vec2 q=vUv-.5; c*=1.-dot(q,q)*.75;
        gl_FragColor=vec4(pow(c,vec3(1./2.2)),1.); }`, depthTest:false, depthWrite:false });
  return {rtScene, rtA, rtB, quad, qs, qc, blur, final, w:0, h:0};
}
function renderPost(){
  const {renderer, scene, camera, post:P}=R;
  const w=R.canvas.width, h=R.canvas.height;
  if(P.w!==w||P.h!==h){ P.rtScene.setSize(w,h); P.rtA.setSize(w,h); P.rtB.setSize(w,h); P.w=w; P.h=h; }
  renderer.toneMapping=THREE.NoToneMapping;
  renderer.setRenderTarget(P.rtScene); renderer.render(scene, camera);
  P.quad.material=P.blur; P.blur.uniforms.tex.value=P.rtScene.texture; P.blur.uniforms.depth.value=P.rtScene.depthTexture; P.blur.uniforms.dir.value.set(1/w,0);
  renderer.setRenderTarget(P.rtA); renderer.render(P.qs,P.qc);
  P.blur.uniforms.tex.value=P.rtA.texture; P.blur.uniforms.dir.value.set(0,1/h);
  renderer.setRenderTarget(P.rtB); renderer.render(P.qs,P.qc);
  P.quad.material=P.final; P.final.uniforms.tex.value=P.rtB.texture;
  renderer.setRenderTarget(null); renderer.render(P.qs,P.qc);
}

/* ---------- the world ---------- */
function sandHeight(x, z, d){   // raked gravel: rings follow the nearest island, rock or pond and never cross; straight grooves elsewhere
  const q=(c,rx,rz)=>Math.hypot((x-c[0])/rx,(z-c[1])/rz);
  const isl=q(d.tree,2.6,1.9), rock=q(d.rock,1.25,.95), pond=q(d.pond,2.25,1.55);
  const de=Math.min((isl-1)*2.2, (rock-1)*1.1, (pond-1.12)*1.6);   // ~metres from the nearest edge
  const ringH=Math.sin(Math.max(0,de)*TAU/.34)*.04, lineH=Math.sin(z*TAU/.34 + Math.sin(x*.35)*1.2)*.038;
  const k=Math.min(1,Math.max(0,(de-1.05)/.25));
  let h=ringH*(1-k)+lineH*k;
  h*=Math.min(1, Math.max(0,de*6));                                                   // smooth edge next to each feature
  if(isl<1) h+= .16*Math.cos(Math.min(1,isl)*Math.PI/2)**.6 + fbm(x*2,z*2,7,3)*.05;   // moss island
  if(pond<1.14 && pond>=1) h+= .05*Math.sin((pond-1)/.14*Math.PI) + fbm(x*3,z*3,4,2)*.03;   // soft mossy bank
  if(pond<1) h-= .42*Math.cos(Math.min(1,pond)*Math.PI/2)**.7;                        // pond basin
  return h;
}
function buildEnv(desc){
  const env=new THREE.Group(), tod=TOD[desc.tod], night=desc.tod==="night", sea=desc.season, leaf=LEAF[sea];
  const D={ tree:[0,Z(226)], rock:[X(232),Z(236)], pond:[X(62),Z(240)] };
  R.lanterns=[];
  /* sky dome */
  const sky=new THREE.Mesh(new THREE.SphereGeometry(90,32,16), new THREE.ShaderMaterial({ side:THREE.BackSide, depthWrite:false, fog:false,
    uniforms:{ top:{value:new THREE.Color(tod.top)}, hor:{value:new THREE.Color(tod.hor)}, sunDir:{value:new THREE.Vector3(...tod.sun).normalize()}, sunC:{value:new THREE.Color(tod.sunC)}, night:{value:night?1:0} },
    vertexShader:`varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader:`uniform vec3 top,hor,sunC,sunDir; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float y=clamp(vP.y,0.,1.); vec3 c=mix(hor,top,pow(y,.55));
        float s=max(dot(vP,sunDir),0.); c+=sunC*(pow(s,600.)*3.+pow(s,12.)*.35)*(1.-night*.6);
        if(night>.5){ vec3 q=floor(vP*260.); float st=step(.9965,h(q)); c+=vec3(st)*.9*smoothstep(.05,.3,y); }
        gl_FragColor=vec4(c,1.); }` }));
  env.add(sky);
  /* clouds: soft billboards */
  const cloudTex=(()=>{ const c=document.createElement("canvas"); c.width=256; c.height=128; const g=c.getContext("2d");
    for(let i=0;i<14;i++){ const x=40+Math.random()*176, y=50+Math.random()*40, r=22+Math.random()*30; const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,"rgba(255,255,255,.75)"); gr.addColorStop(1,"rgba(255,255,255,0)"); g.fillStyle=gr; g.beginPath(); g.arc(x,y,r,0,TAU); g.fill(); }
    return canvasTex(c); })();
  for(const [x,y,z,s] of [[-16,19,-50,12],[10,23,-55,15],[26,16,-48,9],[-30,14,-52,10]]){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s/2), new THREE.MeshBasicMaterial({map:cloudTex, transparent:true, depthWrite:false, opacity:night?.12:.85, color:night?"#8890C0":(desc.tod==="evening"?"#FFD6C0":"#FFFFFF"), fog:false}));
    m.position.set(x,y,z); env.add(m); }
  /* lights */
  const sun=new THREE.DirectionalLight(tod.sunC, tod.sunI); sun.position.set(...tod.sun).multiplyScalar(2); sun.target.position.set(0,0,0);
  sun.castShadow=true; sun.shadow.mapSize.set(1024,1024); Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:1,far:50}); sun.shadow.bias=-.0006; sun.shadow.normalBias=.02; sun.shadow.radius=3;
  env.add(sun, sun.target, new THREE.HemisphereLight(tod.hemiS, tod.hemiG, tod.hemiI));
  R.scene.fog=new THREE.Fog(tod.fog, 16, 60);
  /* far mountains */
  const mMat=new THREE.MeshStandardMaterial({color:night?"#3A3F6E":"#A9A6D2", roughness:1, flatShading:true});
  for(const [x,z,r,h] of [[-22,-48,16,9],[-6,-55,18,12],[14,-50,15,10],[30,-46,13,7]]){
    const g=new THREE.ConeGeometry(r,h,9,3); const p=g.attributes.position; for(let i=0;i<p.count;i++){ const yy=p.getY(i); if(yy<h/2-.1) p.setX(i,p.getX(i)*(1+(hash(i,1,3)-.5)*.25)); } g.computeVertexNormals();
    const m=new THREE.Mesh(g,mMat); m.position.set(x,h/2-1,z); env.add(m); }
  if(desc.fuji){ const g=new THREE.ConeGeometry(4.6,3.2,9,1); const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:"#FFFFFF",roughness:.9,flatShading:true})); m.position.set(-6,12-1.6-.02,-55); env.add(m); }
  /* forest behind the fence */
  const fGeo=new THREE.SphereGeometry(1,20,14); { const p=fGeo.attributes.position; for(let i=0;i<p.count;i++){ const v=new THREE.Vector3().fromBufferAttribute(p,i); const n=1+(fbm(v.x*2+3,v.y*2+v.z,5,3)-.5)*.5; p.setXYZ(i,v.x*n,v.y*n*.9,v.z*n); } fGeo.computeVertexNormals(); }
  const fMat=new THREE.MeshStandardMaterial({roughness:.95});
  const nF=96, forest=new THREE.InstancedMesh(fGeo,fMat,nF); const m4=new THREE.Matrix4(), col=new THREE.Color();
  for(let i=0;i<nF;i++){ const row=i%4, x=-20+ (i/nF)*40 + (hash(i,2,1)-.5)*1.4, z=-6.2-row*2.4-hash(i,3,1)*1.2, s=.9+hash(i,4,1)*.8+row*.35;
    m4.compose(new THREE.Vector3(x, s*.55+row*.55-.2, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0,hash(i,5,1)*6,0)), new THREE.Vector3(s,s*1.05,s)); forest.setMatrixAt(i,m4);
    col.set(leaf[i%2]).lerp(new THREE.Color(night?"#1E2340":"#4E6E58"), .22+hash(i,6,1)*.2).lerp(new THREE.Color(tod.fog), row*.12); forest.setColorAt(i,col); }
  forest.castShadow=true; forest.receiveShadow=true; env.add(forest);
  /* bamboo fence */
  const bam=new THREE.MeshStandardMaterial({color:sea==="winter"?"#D8CCA8":"#D9C48A", roughness:.55});
  const poleG=new THREE.CylinderGeometry(.055,.06,1.15,8); const nP=76, poles=new THREE.InstancedMesh(poleG,bam,nP);
  for(let i=0;i<nP;i++){ const h=1+hash(i,7,2)*.08; m4.compose(new THREE.Vector3(-10.5+i*.28, h*.575-.02, -4.35), new THREE.Quaternion(), new THREE.Vector3(1,h,1)); poles.setMatrixAt(i,m4); }
  poles.castShadow=poles.receiveShadow=true; env.add(poles);
  for(const y of [.45,.85]){ const r=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,22,8), bam); r.rotation.z=Math.PI/2; r.position.set(0,y,-4.27); r.castShadow=true; env.add(r); }
  /* ground */
  const [ga, gn]=grainTextures(256, 22, 3, 2.6);
  const gMap=canvasTex(ga,true,14), gNorm=canvasTex(gn,false,14);
  const W=30, Dp=22, geo=new THREE.PlaneGeometry(W,Dp,300,220); geo.rotateX(-Math.PI/2); geo.translate(0,0,1);
  const pos=geo.attributes.position, colors=new Float32Array(pos.count*3);
  const sand=new THREE.Color(sea==="winter"?"#F2F2F4":"#E4D8C4"), moss=new THREE.Color(sea==="winter"?"#E8EEEC":(sea==="autumn"?"#A7B57F":"#8DBB86")), mossD=new THREE.Color(sea==="winter"?"#C9D3D0":"#5E8E62"), wet=new THREE.Color("#9C9183");
  for(let i=0;i<pos.count;i++){ const x=pos.getX(i), z=pos.getZ(i); pos.setY(i, sandHeight(x,z,D));
    const isl=Math.hypot((x-D.tree[0])/2.6,(z-D.tree[1])/1.9), pond=Math.hypot((x-D.pond[0])/2.25,(z-D.pond[1])/1.55);
    const c=sand.clone();
    if(isl<1){ const t=fbm(x*3,z*3,9,3); c.copy(moss).lerp(mossD, t*.9); }
    else if(isl<1.08) c.lerp(moss,.5);
    if(pond>=.98 && pond<1.14){ const t=fbm(x*4,z*4,3,2); c.copy(moss).lerp(mossD, t*.8); }
    else if(pond<.98){ c.copy(wet).lerp(new THREE.Color(night?"#141E30":"#33505A"), Math.min(1,(1-pond)*1.6)); }
    if(z<-3.2) c.multiplyScalar(.93);
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b; }
  geo.setAttribute("color", new THREE.BufferAttribute(colors,3)); geo.computeVertexNormals();
  const ground=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({vertexColors:true, map:gMap, normalMap:gNorm, normalScale:new THREE.Vector2(.9,.9), roughness:.95}));
  ground.receiveShadow=true; env.add(ground);
  /* rocks */
  const rockMat=new THREE.MeshStandardMaterial({color:night?"#8A8AA0":"#B9B2A8", roughness:.9, map:gMap, normalMap:gNorm, normalScale:new THREE.Vector2(1.5,1.5)});
  const rock=(x,z,s,sy=.7,seed=1)=>{ const g=new THREE.SphereGeometry(1,28,18); const p=g.attributes.position;
      for(let i=0;i<p.count;i++){ const v=new THREE.Vector3().fromBufferAttribute(p,i); const n=1+(fbm(v.x*1.6+seed,v.y*1.6,v.z*1.6+seed*3,4)-.5)*.75; p.setXYZ(i,v.x*n,Math.max(-.2,v.y*n)*sy,v.z*n); }
      g.computeVertexNormals(); const m=new THREE.Mesh(g,rockMat); m.position.set(x,0,z); m.scale.setScalar(s); m.rotation.y=seed; m.castShadow=m.receiveShadow=true; env.add(m); return m; };
  rock(D.rock[0], D.rock[1], .62, .75, 2); rock(D.rock[0]+.75, D.rock[1]+.35, .32, .7, 5);
  const mossCap=new THREE.Mesh(new THREE.SphereGeometry(.32,16,8,0,TAU,0,Math.PI/2), new THREE.MeshStandardMaterial({color:moss, roughness:1})); mossCap.scale.set(1,.35,.8); mossCap.position.set(D.rock[0]-.12, .5, D.rock[1]-.05); env.add(mossCap);
  for(let i=0;i<22;i++){ const a=i/22*TAU+.2; if(Math.cos(a)>.55 && Math.sin(a)>-.2 && Math.sin(a)<.6) continue; rock(D.pond[0]+Math.cos(a)*2.25, D.pond[1]+Math.sin(a)*1.52, .16+hash(i,9,4)*.12, .6, i*1.7); }
  /* water */
  const nTex=(()=>{ const n=256, h=tileNoise(n,6,11,3), c=document.createElement("canvas"); c.width=c.height=n; const d=c.getContext("2d").createImageData(n,n);
    for(let y=0;y<n;y++) for(let x=0;x<n;x++){ const i=(y*n+x)*4, H=(a,b)=>h[((b+n)%n)*n+(a+n)%n], dx=(H(x+1,y)-H(x-1,y))*5, dy=(H(x,y+1)-H(x,y-1))*5, l=Math.hypot(dx,dy,1);
      d.data[i]=(-dx/l*.5+.5)*255; d.data[i+1]=(dy/l*.5+.5)*255; d.data[i+2]=(1/l*.5+.5)*255; d.data[i+3]=255; }
    c.getContext("2d").putImageData(d,0,0); return canvasTex(c,false,3); })();
  const pmrem=new THREE.PMREMGenerator(R.renderer); const skyScene=new THREE.Scene(); skyScene.add(sky.clone());
  const envMap=pmrem.fromScene(skyScene, .02).texture; pmrem.dispose();
  const wGeo=new THREE.CircleGeometry(1,64,0,TAU); { const p=wGeo.attributes.position, col=new Float32Array(p.count*3), deep=new THREE.Color(night?"#0A1230":"#16405E"), shallow=new THREE.Color(night?"#2A3C6A":"#6FB0C8");
    for(let i=0;i<p.count;i++){ const r=Math.hypot(p.getX(i),p.getY(i)); const c=deep.clone().lerp(shallow, Math.pow(r,2.2)); col[i*3]=c.r; col[i*3+1]=c.g; col[i*3+2]=c.b; } wGeo.setAttribute("color", new THREE.BufferAttribute(col,3)); }
  const depthMap=(()=>{ const c=document.createElement("canvas"); c.width=c.height=256; const g=c.getContext("2d"), gr=g.createRadialGradient(128,128,0,128,128,128);
    gr.addColorStop(0, night?"#08102A":"#123A58"); gr.addColorStop(.55, night?"#14204A":"#2B6688"); gr.addColorStop(.85, night?"#26386A":"#5FA2BE"); gr.addColorStop(1, night?"#34487A":"#8CC4D2");
    g.fillStyle=gr; g.fillRect(0,0,256,256); const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t; })();
  const water=new THREE.Mesh(wGeo, new THREE.MeshStandardMaterial({map:depthMap, color:"#FFFFFF", roughness:.12, metalness:0, envMap, envMapIntensity:.35, normalMap:nTex, normalScale:new THREE.Vector2(.25,.25), transparent:true, opacity:.9, depthWrite:false}));
  water.rotation.x=-Math.PI/2; water.scale.set(2.2,1.5,1); water.position.set(D.pond[0], -.08, D.pond[1]); water.receiveShadow=true; env.add(water); R.water=water;
  const padM=new THREE.MeshStandardMaterial({color:sea==="winter"?"#9DB09A":"#7FB872",roughness:.6, side:THREE.DoubleSide});
  for(const [dx,dz,s,r] of [[1.0,-.25,.3,0],[-.95,.5,.22,2],[.45,.7,.18,4],[-1.35,-.35,.2,1],[1.35,.4,.16,5],[-.25,-.7,.15,3]]){
    const pad=new THREE.Mesh(new THREE.CircleGeometry(s,24,.35,TAU-.45), padM); pad.rotation.set(-Math.PI/2,0,r); pad.position.set(D.pond[0]+dx,-.065,D.pond[1]+dz); pad.receiveShadow=true; env.add(pad); }
  if(sea==="spring"||sea==="summer") for(const [dx,dz] of [[1.05,-.27],[-.25,-.72]]){   // lotus flowers
    const fl=new THREE.Group(), pm=new THREE.MeshStandardMaterial({color:"#F6B8C8", roughness:.5, emissive:"#F6B8C8", emissiveIntensity:.15});
    for(let i=0;i<8;i++){ const pe=new THREE.Mesh(new THREE.SphereGeometry(.07,10,8), pm); pe.scale.set(.55,1.3,.3); const a=i/8*TAU; pe.position.set(Math.cos(a)*.05,.07,Math.sin(a)*.05); pe.rotation.set(Math.sin(a)*.5,0,-Math.cos(a)*.5); fl.add(pe); }
    const core=new THREE.Mesh(new THREE.SphereGeometry(.035,10,8), new THREE.MeshStandardMaterial({color:"#F4D36A"})); core.position.y=.07; fl.add(core);
    fl.position.set(D.pond[0]+dx,-.06,D.pond[1]+dz); fl.traverse(o=>{ if(o.isMesh) o.castShadow=true; }); env.add(fl); }
  if(sea!=="winter"){   // reeds and iris along the back of the pond
    const reedG=new THREE.ConeGeometry(.018,.9,4); reedG.translate(0,.45,0);
    const reed=new THREE.InstancedMesh(reedG, new THREE.MeshStandardMaterial({color:sea==="autumn"?"#B9A56A":"#6FA866", roughness:.9}), 36);
    for(let i=0;i<36;i++){ const a=Math.PI*(1.1+hash(i,1,12)*.45), r=1.02+hash(i,2,12)*.1, x=D.pond[0]+Math.cos(a)*2.25*r, z=D.pond[1]+Math.sin(a)*1.55*r;
      m4.compose(new THREE.Vector3(x,0,z), new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(i,3,12)-.5)*.35,0,(hash(i,4,12)-.5)*.35)), new THREE.Vector3(1,.6+hash(i,5,12)*.8,1)); reed.setMatrixAt(i,m4); }
    reed.castShadow=true; env.add(reed);
    if(sea!=="autumn"){ const irisM=new THREE.MeshStandardMaterial({color:"#8C7BD6", roughness:.5, emissive:"#8C7BD6", emissiveIntensity:.12});
      for(let i=0;i<5;i++){ const a=Math.PI*(1.14+i*.09), x=D.pond[0]+Math.cos(a)*2.36, z=D.pond[1]+Math.sin(a)*1.62;
        const fl=new THREE.Mesh(new THREE.SphereGeometry(.06,10,8), irisM); fl.scale.set(1,.7,1); fl.position.set(x,.72+hash(i,6,12)*.2,z); env.add(fl); } } }
  /* shishi-odoshi: a bamboo tube fills with water, tips over and clacks back */
  { const bamM=new THREE.MeshStandardMaterial({color:"#B8C46A", roughness:.45}), dark=new THREE.MeshStandardMaterial({color:"#7D8A3E", roughness:.6});
    const so=new THREE.Group(); so.position.set(D.pond[0]+2.55, 0, D.pond[1]+.35); so.rotation.y=-.25; so.scale.setScalar(1.35);
    for(const sx of [-.11,.11]){ const post=new THREE.Mesh(new THREE.CylinderGeometry(.035,.04,.62,10), bamM); post.position.set(0,.31,sx); so.add(post); }
    const pivot=new THREE.Group(); pivot.position.set(0,.5,0); so.add(pivot);
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(.045,.05,.9,12), bamM); tube.rotation.z=Math.PI/2; tube.position.x=-.12; pivot.add(tube);
    const mouth=new THREE.Mesh(new THREE.CircleGeometry(.044,12), dark); mouth.position.set(-.575,0,0); mouth.rotation.y=-Math.PI/2; pivot.add(mouth);
    const feed=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.7,10), bamM); feed.rotation.z=Math.PI/2-.25; feed.position.set(.15,.92,0); so.add(feed);
    const stoneB=new THREE.Mesh(new THREE.SphereGeometry(.16,16,10), new THREE.MeshStandardMaterial({color:"#9C968E", roughness:.9})); stoneB.scale.set(1,.5,1); stoneB.position.set(.22,.05,0); so.add(stoneB);
    so.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } }); env.add(so);
    R.shishi={pivot, so, last:-1};
  }
  /* ripple rings on the water */
  R.ripples=[]; const rippleM=()=>new THREE.MeshBasicMaterial({color:"#FFFFFF", transparent:true, opacity:0, depthWrite:false});
  for(let i=0;i<5;i++){ const r=new THREE.Mesh(new THREE.RingGeometry(.9,1,40), rippleM()); r.rotation.x=-Math.PI/2; r.position.y=-.075; r.visible=false; env.add(r); R.ripples.push({m:r, t0:-9}); }
  /* grass tufts */
  if(sea!=="winter"){ const bl=new THREE.ConeGeometry(.025,.32,3); bl.translate(0,.16,0); const gm=new THREE.MeshStandardMaterial({color:sea==="autumn"?"#C2AE78":"#7FB27A", roughness:.9});
    const n=160, tufts=new THREE.InstancedMesh(bl,gm,n); let k=0;
    for(const [tx,tz] of [[-1.8,-1],[1.9,-.9],[-2.3,2.4],[2.6,2.9],[-5.6,-2.6],[5.2,-2.8],[1.1,.2],[4.6,1.6],[-4.8,3.4]]) for(let j=0;j<16 && k<n;j++,k++){
      const a=hash(k,1,8)*TAU, r=hash(k,2,8)*.22; m4.compose(new THREE.Vector3(tx+Math.cos(a)*r,0,tz+Math.sin(a)*r), new THREE.Quaternion().setFromEuler(new THREE.Euler((hash(k,3,8)-.5)*.7,a,(hash(k,4,8)-.5)*.7)), new THREE.Vector3(1,.7+hash(k,5,8)*.8,1)); tufts.setMatrixAt(k,m4); }
    tufts.castShadow=true; env.add(tufts); }
  /* foreground: big leaves and grass close to the lens (blurred by the tilt-shift) */
  const fgMat=new THREE.MeshStandardMaterial({color:night?"#24304A":(sea==="autumn"?"#B98A5A":"#5E8F5C"), roughness:.9, side:THREE.DoubleSide});
  const leafG=new THREE.ConeGeometry(.2,1.6,5); leafG.scale(1,1,.3); leafG.translate(0,.8,0);
  for(let i=0;i<26;i++){ const side=i%2?1:-1, x=side*(2.6+hash(i,1,6)*3.2), z=6+hash(i,2,6)*2.2; const m=new THREE.Mesh(leafG,fgMat);
    m.position.set(x,-.15,z); m.rotation.set((hash(i,3,6)-.6)*.7, hash(i,4,6)*6, side*(.15+hash(i,5,6)*.45)); m.scale.set(1.6, 1.1+hash(i,6,6)*1.2, 1.6); env.add(m); }
  /* floating dust / fireflies */
  const nM=60, mg=new THREE.BufferGeometry(), mp=new Float32Array(nM*3); for(let i=0;i<nM;i++){ mp[i*3]=(hash(i,1,9)-.5)*14; mp[i*3+1]=.3+hash(i,2,9)*6; mp[i*3+2]=-3+hash(i,3,9)*7; }
  mg.setAttribute("position", new THREE.BufferAttribute(mp,3));
  const dot=(()=>{ const c=document.createElement("canvas"); c.width=c.height=32; const g=c.getContext("2d"), gr=g.createRadialGradient(16,16,0,16,16,16); gr.addColorStop(0,"rgba(255,255,255,1)"); gr.addColorStop(1,"rgba(255,255,255,0)"); g.fillStyle=gr; g.fillRect(0,0,32,32); return canvasTex(c); })();
  const motes=new THREE.Points(mg, new THREE.PointsMaterial({map:dot, size:night?.16:.08, color:night?"#FFE9A0":"#FFF6DC", transparent:true, opacity:night?.95:.7, depthWrite:false, blending:THREE.AdditiveBlending}));
  env.add(motes); R.motes=motes;
  R.D=D;
  return env;
}

/* ---------- decorations in 3D (the rest are Fluent pictures) ---------- */
function buildDeco3D(id, x, z, night, group){
  if(id==="torii"){ const red=new THREE.MeshStandardMaterial({color:"#E0583F", roughness:.6}), blk=new THREE.MeshStandardMaterial({color:"#3A3540", roughness:.6});
    const g=new THREE.Group(); for(const s of [-1,1]){ const p=new THREE.Mesh(new THREE.CylinderGeometry(.09,.11,2.1,12),red); p.position.set(s*.75,1.05,0); g.add(p); }
    const k=new THREE.Mesh(new THREE.BoxGeometry(1.9,.12,.18),red); k.position.y=1.55; g.add(k);
    const t=new THREE.Mesh(new THREE.BoxGeometry(2.3,.16,.26),blk); t.position.y=2.12; g.add(t); const t2=new THREE.Mesh(new THREE.BoxGeometry(2.1,.1,.22),red); t2.position.y=1.98; g.add(t2);
    g.traverse(o=>{ if(o.isMesh){ o.castShadow=o.receiveShadow=true; } }); g.scale.setScalar(.85); group.add(g); return true; }
  if(id==="bamboo"){ const mat=new THREE.MeshStandardMaterial({color:"#8DC07A", roughness:.5}), leafM=new THREE.MeshStandardMaterial({color:"#79B26E", roughness:.8});
    for(let i=0;i<7;i++){ const h=2.4+hash(i,1,4)*1.6; const c=new THREE.Mesh(new THREE.CylinderGeometry(.05,.06,h,8),mat); c.position.set((hash(i,2,4)-.5)*.9, h/2, (hash(i,3,4)-.5)*.5); c.castShadow=true; group.add(c);
      const l=new THREE.Mesh(new THREE.IcosahedronGeometry(.32,1),leafM); l.scale.set(1.2,.5,1); l.position.set(c.position.x+.15,h-.1,c.position.z); l.castShadow=true; group.add(l); }
    return true; }
  if(id==="lamps"){ const rope=new THREE.MeshStandardMaterial({color:"#6B5A4A"}), paper=new THREE.MeshStandardMaterial({color:"#F2A07C", emissive:night?"#FF9A50":"#000000", emissiveIntensity:night?2.2:0, roughness:.6});
    const pts=[]; for(let i=0;i<=20;i++){ const t=i/20; pts.push(new THREE.Vector3(-7+t*14, 4.6-Math.sin(t*Math.PI)*.7, -3.2)); }
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),40,.015,4), rope));
    for(let i=0;i<5;i++){ const t=(i+.5)/5, l=new THREE.Mesh(new THREE.SphereGeometry(.18,16,12), paper); l.scale.y=1.3; l.position.set(-7+t*14, 4.6-Math.sin(t*Math.PI)*.7-.3, -3.2); l.castShadow=true; group.add(l);
      if(night && (i===1||i===3)){ const pl=new THREE.PointLight("#FFB070", 6, 7, 1.6); pl.position.copy(l.position); group.add(pl); } }
    return true; }
  if(id==="stones") return true;   // the big rock is already in the world
  return false;
}

/* ---------- 2D figures standing in the world ---------- */
const texCache={};
async function fluentTex(code, filter=""){
  const key=code+"|"+filter; if(texCache[key]) return texCache[key];
  const raw=await loadImg(`emoji/${code}.webp`);
  const c=document.createElement("canvas"); c.width=c.height=256; const g=c.getContext("2d"); if(filter) g.filter=filter; g.drawImage(raw,0,0,256,256);
  return texCache[key]={img:c};
}
function partsTextures(img, parts){   // body with holes + cut-out parts, like the SVG rig
  const n=256, body=document.createElement("canvas"); body.width=body.height=n; const g=body.getContext("2d"); g.drawImage(img,0,0,n,n);
  for(const q of parts){ const [x0,y0,x1,y1]=q.r; g.clearRect(x0, y0+(q.h||0), x1-x0, y1-y0-(q.h||0)); }
  const cuts=parts.map(q=>{ const [x0,y0,x1,y1]=q.r, c=document.createElement("canvas"); c.width=x1-x0; c.height=y1-y0; c.getContext("2d").drawImage(img,x0,y0,x1-x0,y1-y0,0,0,x1-x0,y1-y0); return c; });
  return {body, cuts};
}
function normalTex(src, strength=5){
  const n=src.width, m=src.height, c=document.createElement("canvas"); c.width=n; c.height=m; const g=c.getContext("2d");
  g.filter=`blur(${Math.max(2,Math.round(Math.min(n,m)/26))}px)`; g.drawImage(src,0,0); const A=g.getImageData(0,0,n,m).data;
  const S=src.getContext("2d").getImageData(0,0,n,m).data, out=g.createImageData(n,m), d=out.data;
  const H=(x,y)=>{ x=x<0?0:x>=n?n-1:x; y=y<0?0:y>=m?m-1:y; const i=(y*n+x)*4; return Math.sqrt(A[i+3]/255) + (S[i]+S[i+1]+S[i+2])/765*.18; };
  for(let y=0;y<m;y++) for(let x=0;x<n;x++){ const i=(y*n+x)*4, dx=(H(x+1,y)-H(x-1,y))*strength, dy=(H(x,y+1)-H(x,y-1))*strength, l=Math.hypot(dx,dy,1);
    d[i]=(-dx/l*.5+.5)*255; d[i+1]=(dy/l*.5+.5)*255; d[i+2]=(1/l*.5+.5)*255; d[i+3]=255; }
  g.filter="none"; g.putImageData(out,0,0); const t=new THREE.CanvasTexture(c); return t;
}
function spriteMat(map, tint){
  map.colorSpace=THREE.SRGBColorSpace;
  const src=map.image, nm=(src && src.getContext) ? normalTex(src) : null;
  const m=new THREE.MeshStandardMaterial({map, alphaTest:.45, side:THREE.DoubleSide, roughness:.62, emissive:"#ffffff", emissiveMap:map, emissiveIntensity:(R.emis??.32)*(nm?.62:1)});
  if(nm){ m.normalMap=nm; m.normalScale.set(1.1,1.1); }
  if(tint) m.color.set(tint);
  return m;
}
function depthMat(map){ return new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking, map, alphaTest:.45}); }
function plane(w,h,mat){ const g=new THREE.PlaneGeometry(w,h); const m=new THREE.Mesh(g,mat); m.castShadow=true; m.customDepthMaterial=depthMat(mat.map); return m; }

async function makeFigure(f, desc){   // f: {id, code, x, z, y, size, motion, tap, tint}
  const {img}=await fluentTex(f.code, f.filter); const size=f.size/U;
  const root=new THREE.Group(); root.position.set(f.x, f.y||0, f.z);
  const face=new THREE.Group(); root.add(face); const inner=new THREE.Group(); face.add(inner);
  const parts=desc.rig[f.code];
  const parts3=[];
  if(parts){
    const {body, cuts}=partsTextures(img, parts);
    const b=plane(size,size,spriteMat(new THREE.CanvasTexture(body))); b.position.y=size/2; inner.add(b); b.userData.tap=f.tap;
    if(f.tap) R.tappables.push(b);
    parts.forEach((q,i)=>{ const [x0,y0,x1,y1]=q.r, pw=(x1-x0)/256*size, ph=(y1-y0)/256*size;
      const pivot=new THREE.Group(); pivot.position.set((q.p[0]/256-.5)*size, (1-q.p[1]/256)*size, -.002*(i+1));
      const m=plane(pw,ph,spriteMat(new THREE.CanvasTexture(cuts[i])));
      m.position.set(((x0+x1)/2-q.p[0])/256*size, -((y0+y1)/2-q.p[1])/256*size, 0); pivot.add(m); inner.add(pivot); parts3.push({pivot, c:q.c});
      if(f.tap){ m.userData.tap=f.tap; R.tappables.push(m); } });
  } else {
    const t=new THREE.CanvasTexture(img);
    const b=plane(size,size,spriteMat(t)); b.position.y=size/2; inner.add(b); b.userData.tap=f.tap; if(f.tap) R.tappables.push(b);
  }
  // face the camera (around the vertical axis); a crawler lies flat on the ground
  root.rotation.y=Math.atan2(R.camera.position.x-root.position.x, R.camera.position.z-root.position.z)*.6;
  if(f.motion && f.motion[0]==="crawl"){   // climbing on the face of a rock: lean back, move and turn within that face
    face.rotation.x=-.32; root.rotation.y=0; inner.children.forEach(ch=>ch.position.y-=size/2); }
  if(f.flip) face.scale.x=-1;
  R.movers.push({root, face, inner, parts:parts3, f, base:root.position.clone(), phase:f.phase||0, size,
    st:{x:f.x, z:f.z, tx:f.x, tz:f.z, wait:Math.random()*2, go:0, dir:1, head:Math.random()*6}});
  return root;
}
async function makeTree(desc){
  const c=document.createElement("canvas"); c.width=1024; c.height=Math.round(1024*260/300);
  const img=await loadImg("data:image/svg+xml;charset=utf-8,"+encodeURIComponent(desc.treeSVG));
  const cx=c.getContext("2d"); cx.filter="saturate(1.35) contrast(1.05)"; cx.drawImage(img,0,0,c.width,c.height); cx.globalAlpha=.6; cx.drawImage(img,0,0,c.width,c.height);   // fuller blossom
  const t=new THREE.CanvasTexture(c); const mat=spriteMat(t); mat.emissiveIntensity=(R.emis??.32)*.8; mat.alphaTest=.04; mat.transparent=true; mat.depthWrite=true;
  const m=plane(300/U, 260/U, mat); m.position.set(0, (226-130)/U - .05, R.D.tree[1]);
  return m;
}

/* ---------- per frame ---------- */
function wander(mv, dt, rad, speed, zr=.6){   // walk to a random spot nearby, stop for a moment, walk on
  const st=mv.st, b=mv.base;
  if(st.wait>0){ st.wait-=dt; st.go=Math.max(0,st.go-dt*4); return 0; }
  const dx=st.tx-st.x, dz=st.tz-st.z, d=Math.hypot(dx,dz);
  if(d<.03){ st.wait=1+Math.random()*3; const a=Math.random()*TAU, r=rad*(.35+Math.random()*.65);
    st.tx=Math.max(-5.6,Math.min(5.6,b.x+Math.cos(a)*r)); st.tz=Math.max(-3.4,Math.min(4,b.z+Math.sin(a)*r*zr)); return 0; }
  st.go=Math.min(1,st.go+dt*4); const v=Math.min(d, speed*dt*st.go);
  st.x+=dx/d*v; st.z+=dz/d*v; if(Math.abs(dx)>.02) st.dir = dx>0 ? -1 : 1;
  return dx/d;
}
function animate(t){
  const dt=Math.min(.1, t-(R.lastT??t)); R.lastT=t;
  for(const mv of R.movers){
    const {root, face, inner, parts, f, base, st}=mv, m=f.motion||["still",0,10], [kind,dx,dur]=m, T=t+mv.phase, dxm=dx/U;
    let p=(T/dur)%1, ox=0, oy=0, flip=1, moving=1;
    const ground = (kind==="walk"||kind==="hop") && (f.y||0)===0;
    if(ground){   // wander around the home spot
      const rad=Math.max(.8, Math.abs(dxm)*1.1), speed=Math.abs(dxm)*2/(dur*.9)*(kind==="hop"?1.5:1.1)+.05;
      wander(mv, dt, rad, speed); moving=st.go; root.position.set(st.x, base.y, st.z);
      face.scale.x=st.dir*(f.faceRight?-1:1);
      if(kind==="hop"){ const q=(T/.8)%1; oy = moving>.2 && q<.7 ? Math.sin(q/.7*Math.PI)*.22*moving : 0; }
      else oy=Math.abs(Math.sin(T*TAU))*.03*moving;
      if(moving<.1){ const z=(T/4.5)%1; inner.rotation.z = z>.6&&z<.8 ? Math.sin((z-.6)/.2*Math.PI)*.12 : 0; } else inner.rotation.z=0;   // sniffing / looking around
      root.position.y=base.y+oy;
    } else if(kind==="crawl"){
      if(st.u===undefined){ st.u=0; st.v=0; st.tu=0; st.tv=0; st.go=0; }
      if(st.wait>0){ st.wait-=dt; st.go=Math.max(0,st.go-dt*4); }
      else { const du=st.tu-st.u, dv=st.tv-st.v, d=Math.hypot(du,dv);
        if(d<.02){ st.wait=.8+Math.random()*2.5; st.tu=(Math.random()-.5)*.7; st.tv=Math.random()*.34; }
        else { st.go=Math.min(1,st.go+dt*4); const v=Math.min(d,.2*dt*st.go); st.u+=du/d*v; st.v+=dv/d*v;
          const want=Math.atan2(-du,dv); let dA=want-st.head; dA=Math.atan2(Math.sin(dA),Math.cos(dA)); st.head+=dA*Math.min(1,dt*6); } }
      moving=st.go; inner.position.set(st.u, st.v, .02); inner.rotation.z=st.head+Math.sin(T*16)*.14*moving; face.scale.x=1;
    } else {
      if(kind==="walk"||kind==="hop"){ ox = p<.45 ? p/.45 : p<.5 ? 1 : p<.95 ? 1-(p-.5)/.45 : 0; ox*=dxm; flip = (p>=.48 && p<.98) ? -1 : 1; }
      if(kind==="hop"){ const q=(T/.8)%1; oy=q<.7 ? Math.sin(q/.7*Math.PI)*.22 : 0; }
      if(kind==="walk"){ oy=Math.abs(Math.sin(T*TAU))*.03; }
      if(kind==="swim"){ ox=Math.sin(p*TAU)*dxm*.5; oy=Math.sin(T*1.7)*.02; flip=Math.cos(p*TAU)>0?1:-1; }
      if(kind==="fly"||kind==="hover"){ ox=Math.sin(p*TAU)*1.2; oy=Math.sin(p*TAU*2)*.5; root.position.z=base.z+Math.cos(p*TAU)*.6; flip=Math.cos(p*TAU)>0?-1:1;
        if(kind==="fly") inner.scale.x=.55+.45*Math.abs(Math.cos(T*11)); }
      if(kind==="glide"){ ox=-14+((T/dur)%1)*28 - base.x; oy=Math.sin(T*.8)*.4; flip=-1; }
      if(kind==="perch"){ const q=p; oy = q>.78&&q<.9 ? Math.sin((q-.78)/.12*Math.PI)*.18 : 0; }
      if(kind==="climb"){ oy=(p<.5?p*2:2-p*2)*Math.abs(dxm); inner.rotation.z=Math.sin(T*10)*.08; }
      root.position.x=base.x+ox; root.position.y=base.y+oy;
      face.scale.x=(f.flip?-1:1)*flip*(dx>0?-1:1)*(f.faceRight?-1:1);
    }
    for(const q of parts){ const c=q.c, amp=(c.includes("small")?.14:.3)*(kind==="crawl"?1.3:1), sp=c.includes("slow")?2.2:kind==="crawl"?.45:1;
      let a=0;
      if(c.includes("wag")) a=Math.sin(T*TAU/(moving>.3?.4:.7))*.22;
      else if(c.includes("fin")) a=Math.sin(T*TAU/1.1)*.3;
      else if(c.includes("wing")) q.pivot.scale.y=.55+.45*Math.abs(Math.cos(T*TAU/.5));
      else if(c.includes("dip")){ const z=(T/7)%1; a = z>.62&&z<.82 ? .38*Math.sin((z-.62)/.2*Math.PI) : 0; }
      else if(c.includes("sway")) a=Math.sin(T*TAU/3.2)*.16;
      else if(kind==="hop"){ const z=(T/.8)%1; a=moving*(c.includes("b")||c.includes("f")?-1:1)*(z<.12? z/.12*.2 : z<.35 ? .2-(z-.12)/.23*.7 : z<.7 ? -.5+(z-.35)/.35*.5 : 0); }
      else if(kind==="perch"||kind==="fly"||kind==="still") a=0;
      else a=Math.sin(T*TAU/sp + (c.includes("b")?Math.PI:0))*amp*moving;
      if(!c.includes("wing")) q.pivot.rotation.z=a; }
  }
  if(R.water && R.water.material.normalMap) R.water.material.normalMap.offset.set(t*.012, t*.008);
  const ripple=(x,z,size=.35)=>{ const r=R.ripples.find(r=>t-r.t0>2.4); if(!r) return; r.t0=t; r.size=size; r.m.position.x=x; r.m.position.z=z; r.m.visible=true; };
  if(R.shishi){ const P=7.5, c=(t%P)/P, n=Math.floor(t/P);
    R.shishi.pivot.rotation.z = c<.86 ? -.28+c/.86*.12 : c<.9 ? -.16+(c-.86)/.04*.75 : c<.95 ? .59 : .59-(c-.95)/.05*.87;   // fills, tips, pours, clacks back
    if(c>.88 && R.shishi.last!==n){ R.shishi.last=n; const w=new THREE.Vector3(-.6,0,0).applyMatrix4(R.shishi.pivot.matrixWorld); ripple(w.x, w.z+.05, .45); } }
  if(R.D && Math.random()<dt*.25){ const a=Math.random()*TAU, r=Math.random()*.7; ripple(R.D.pond[0]+Math.cos(a)*r*1.6, R.D.pond[1]+Math.sin(a)*r, .25); }   // a fish comes up
  for(const r of (R.ripples||[])){ const k=(t-r.t0)/2.4; if(k>1){ r.m.visible=false; continue; } r.m.scale.setScalar(.04+k*r.size); r.m.material.opacity=(1-k)*.55; }
  if(R.motes){ const p=R.motes.geometry.attributes.position; for(let i=0;i<p.count;i++){ p.setY(i, (.3+((hash(i,2,9)*6 + t*(.05+hash(i,4,9)*.08))%6))); p.setX(i, (hash(i,1,9)-.5)*14+Math.sin(t*.3+i)*.3); } p.needsUpdate=true; }
}
function loop(){
  requestAnimationFrame(loop);
  if(!R.host || !R.host.isConnected || document.hidden || !R.env) return;
  const now=performance.now(); if(now-R.last<33) return; R.last=now;
  const w=R.host.clientWidth, h=R.host.clientHeight; if(!w||!h) return;
  const pr=Math.min(window.devicePixelRatio||1, 2);
  if(R.canvas.width!==Math.round(w*pr) || R.canvas.height!==Math.round(h*pr)){ R.renderer.setPixelRatio(pr); R.renderer.setSize(w,h,false); R.camera.aspect=w/h; R.camera.updateProjectionMatrix(); }
  animate((now-R.t0)/1000);
  renderPost();
}

/* ---------- public ---------- */
export async function show(host, desc, onTap, onMove){
  if(!R) init();
  R.host=host; R.onTap=onTap; R.onMove=onMove; R.edit=!!desc.edit; R.canvas.style.touchAction=R.edit?"none":"manipulation";
  { const k=Math.min(1, Math.max(0,(desc.g??1)/.55)), e=k*k*(3-2*k);   // close-up while the tree is small
    R.camera.position.set(0, 2.6+e*3.8, 7.2+e*8); R.camera.lookAt(0, .5+e*2, -1.6+e*.4); R.camera.updateMatrixWorld();
    R.post.blur.uniforms.focus.value=R.camera.position.distanceTo(new THREE.Vector3(0,.5+e*2,-2.2)); } if(R.canvas.parentNode!==host) host.appendChild(R.canvas);
  const ek=[desc.tod,desc.season,desc.fuji,desc.decos.map(d=>d.id).join(",")].join("|");
  if(ek!==R.envKey){ if(R.env) R.scene.remove(R.env); R.env=buildEnv(desc); R.scene.add(R.env); R.envKey=ek; R.dynKey=""; R.post.final.uniforms.grade.value.set(...TOD[desc.tod].grade); R.post.final.uniforms.exposure.value=TOD[desc.tod].exp; }
  const dk=JSON.stringify([desc.treeKey, desc.figures.map(f=>[f.id,f.x,f.z,f.size]), desc.decos, R.edit]);
  if(dk===R.dynKey) return; R.dynKey=dk;
  const dyn=new THREE.Group(); R.movers=[]; R.tappables=[]; R.decoObjs=[]; R.emis={morning:.3, day:.32, evening:.22, night:.1}[desc.tod];
  const night=desc.tod==="night";
  for(const d of desc.decos){
    const sub=new THREE.Group();
    if(!buildDeco3D(d.id, d.x, d.z, night, sub)){ if(!d.code) continue; const fig=await makeFigure({id:d.id, code:d.code, x:0, z:0, y:0, size:d.size, motion:null, filter:d.filter}, desc); R.movers.pop(); sub.add(fig); }
    if(d.id!=="lamps") sub.position.set(d.x,d.y||0,d.z);
    if(d.drag){ sub.userData.deco=d.id; R.decoObjs.push({id:d.id, obj:sub});
      if(R.edit){ const ring=new THREE.Mesh(new THREE.RingGeometry(.42,.5,40), new THREE.MeshBasicMaterial({color:"#FFFFFF", transparent:true, opacity:.85, depthWrite:false})); ring.rotation.x=-Math.PI/2; ring.position.y=.03; sub.add(ring); } }
    dyn.add(sub); }
  dyn.add(await makeTree(desc));
  if((desc.g??1)<.08){   // freshly planted: a little mound of soil with the seed
    const soil=new THREE.Mesh(new THREE.SphereGeometry(.32,24,12,0,TAU,0,Math.PI/2), new THREE.MeshStandardMaterial({color:"#7A5A44", roughness:1}));
    soil.scale.set(1,.35,.8); soil.position.set(0,.1,R.D.tree[1]); soil.castShadow=soil.receiveShadow=true; dyn.add(soil);
    const seed=new THREE.Mesh(new THREE.SphereGeometry(.07,16,10), new THREE.MeshStandardMaterial({color:"#C08A5A", roughness:.6})); seed.scale.set(1,.7,.8); seed.position.set(.04,.22,R.D.tree[1]+.05); seed.castShadow=true; dyn.add(seed); }
  for(const f of desc.figures) dyn.add(await makeFigure(f, desc));
  if(R.dyn) R.scene.remove(R.dyn); R.dyn=dyn; R.scene.add(dyn);
}
export function supported(){ try{ const c=document.createElement("canvas"); return !!(c.getContext("webgl2")||c.getContext("webgl")); }catch(e){ return false; } }
export function _debug(){ return {R, THREE}; }
