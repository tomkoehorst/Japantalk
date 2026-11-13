// Checks the Japanese lesson content in index.html: kanji readings vs kana field (what the voice says),
// romaji vs pronunciation, duplicate meanings and dialog references. Run: node tools/check-content.js
const fs=require('fs'), vm=require('vm'), kuromoji=require('kuromoji'), wk=require('wanakana');
const src=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','index.html'),'utf8');
const block=src.slice(src.indexOf('const UNITS = ['), src.indexOf('// global phrase lookup'));
const ctx={ME:{kata:'トム',romaji:'Tomu',nl:'Tom'}, BUDDY:{id:'neko',name:'Neko',ja:'ネコ',romaji:'Neko'}}; vm.runInNewContext(block.replace('const UNITS','UNITS'),ctx); const UNITS=ctx.UNITS;
const strip=s=>s.replace(/[\s、。，,．.！!？?・「」…〜～]/g,'');
const hira=s=>wk.toHiragana(strip(s),{passRomaji:true});
// romaji normalisation: long vowels and spacing are written in different ways
const rnorm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,m=>m==='̄'?':':'')
  .replace(/([aiueo]):/g,'$1$1').replace(/[^a-z]/g,'').replace(/wo/g,'o').replace(/nippon/g,'nihon').replace(/ou/g,'oo').replace(/(.)\1+/g,'$1$1').replace(/n(?=[aiueoy])/g,'n');
kuromoji.builder({dicPath:require.resolve('kuromoji').replace(/src.*$/,'dict')}).build((err,tk)=>{
  if(err) throw err;
  const issues=[]; const seen={};
  const reading=t=>strip(tk.tokenize(t).map(x=>x.reading||x.surface_form).join(''));
  const pron=t=>strip(tk.tokenize(t).map(x=>x.pronunciation||x.reading||x.surface_form).join(''));
  const toRomaji=k=>wk.toRomaji(k.replace(/ー/g,m=>m)).replace(/-/g,'');
  const all=[]; UNITS.forEach((u,ui)=>{
    u.phrases.forEach(p=>all.push([ui,p,'zin']));
    ctx.expandPattern(u.pattern).forEach(p=>all.push([ui,p,'patroon']));
    (u.theysay||[]).forEach(p=>all.push([ui,p,'zij zeggen']));
  });
  const known=new Set(all.map(([,p])=>p.ja));
  for(const [ui,p,kind] of all){
    const tag=`U${ui+1} ${kind}`;
    if(!p.kana||!p.romaji||!p.nl) { issues.push(`[${tag}] ${p.ja}: kana, romaji of nl ontbreekt`); continue; }
    const said=p.tts||p.ja;   // what the voice reads
    const r=hira(reading(said)).replace(/にっぽん/g,'にほん'), k=hira(p.kana);
    if(r!==k) issues.push(`[${tag} lezing] ${p.ja}: analyser leest "${r}", kana-veld zegt "${k}"`);
    const pr=rnorm(toRomaji(pron(said)).replace(/(.)-/g,'$1$1')), ro=rnorm(p.romaji);
    if(strip(p.kana).length>3 && pr!==ro) issues.push(`[${tag} romaji] ${p.ja}: uitspraak ≈ "${toRomaji(pron(p.ja))}", app zegt "${p.romaji}"`);
    if(seen[p.nl] && seen[p.nl]!==p.ja) issues.push(`[dubbel] "${p.nl}" bij ${seen[p.nl]} en ${p.ja}`); seen[p.nl]=p.ja;
    if(p.reply && !known.has(p.reply)) issues.push(`[${tag}] antwoord ontbreekt: ${p.reply}`);
  }
  UNITS.forEach((u,ui)=>{
    if(u.branch){ const N=u.branch.nodes;
      if(!N[u.branch.start]) issues.push(`[U${ui+1} keuzegesprek] startpunt ontbreekt`);
      for(const [id,n] of Object.entries(N)){
        for(const o of n.options){ if(!known.has(o.ref)) issues.push(`[U${ui+1} keuzegesprek ${id}] zin ontbreekt: ${o.ref}`); if(!N[o.next]) issues.push(`[U${ui+1} keuzegesprek ${id}] volgende stap ontbreekt: ${o.next}`); }
        const l=n.cat, said=l.tts||l.ja, pr=rnorm(toRomaji(pron(said)).replace(/(.)-/g,'$1$1')), ro=rnorm(l.romaji);
        if(pr!==ro) issues.push(`[U${ui+1} keuzegesprek ${id}] ${l.ja}: uitspraak ≈ "${toRomaji(pron(said))}", app zegt "${l.romaji}"`);
      } }
    u.dialog.forEach(l=>{
      if(l.ref){ if(!known.has(l.ref)) issues.push(`[U${ui+1} gesprek] verwijzing ontbreekt: ${l.ref}`); return; }
      if(!l.romaji) return;
      const said=l.tts||l.ja, pr=rnorm(toRomaji(pron(said)).replace(/(.)-/g,'$1$1')), ro=rnorm(l.romaji);
      if(pr!==ro) issues.push(`[U${ui+1} gesprek] ${l.ja}: uitspraak ≈ "${toRomaji(pron(said))}", app zegt "${l.romaji}"`);
    });
  });
  console.log(`${UNITS.reduce((a,u)=>a+u.phrases.length,0)} zinnen + ${UNITS.reduce((a,u)=>a+u.dialog.length,0)} gespreksregels gecontroleerd, ${issues.length} meldingen:`);
  issues.forEach(i=>console.log(' - '+i));
  process.exitCode = issues.length ? 1 : 0;
});
