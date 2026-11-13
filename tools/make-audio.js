// Generates natural Japanese audio for all lesson texts with Google Cloud Text-to-Speech.
// Output: audio/<hash>.mp3 + audio/manifest.json  (text -> {n: normal file, s: slow file})
// Only texts that are not in audio/ yet are sent to Google (the build caches audio/).
// Usage: GOOGLE_TTS_API_KEY=... node tools/make-audio.js      (--dry: only count characters)
const fs=require('fs'), path=require('path'), vm=require('vm'), crypto=require('crypto');
const ROOT=path.join(__dirname,'..'), OUT=path.join(ROOT,'audio');
const KEY=process.env.GOOGLE_TTS_API_KEY, DRY=process.argv.includes('--dry');
const MAX_CHARS=Number(process.env.TTS_MAX_CHARS||30000);   // safety limit per build
// voices: Neko / what you say = calm female voice; "they say" = male voice (a local)
const VOICES={ F:["ja-JP-Neural2-B","ja-JP-Wavenet-B"], M:["ja-JP-Neural2-C","ja-JP-Wavenet-C"] };

const src=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const block=src.slice(src.indexOf('const UNITS = ['), src.indexOf('// global phrase lookup'));
// evaluate the lessons once per companion (Neko / Panda say their own name)
const ctxs=[{id:'neko',name:'Neko',ja:'ネコ',romaji:'Neko'},{id:'panda',name:'Panda',ja:'パンダ',romaji:'Panda'}].map(B=>{
  const c={ME:{kata:'トム',romaji:'Tomu',nl:'Tom'}, BUDDY:B}; vm.runInNewContext(block.replace('const UNITS','UNITS').replace('const STORIES','STORIES'),c); return c; });
const ctx=ctxs[0];

const jobs=[]; const add=(key,text,voice,rate,kind)=>jobs.push({key,text:(text||key).replace(/[～〜]/g,''),voice,rate,kind});
for(const u of ctxs.flatMap(c=>c.UNITS)){
  const phrases=[...u.phrases, ...ctx.expandPattern(u.pattern)];
  for(const p of phrases){ add(p.ja,p.tts,'F',1.0,'n'); add(p.ja,p.tts,'F',0.7,'s'); }
  if(u.pattern) for(const sl of u.pattern.slots) add(sl.ja,u.pattern.say==='kana'?sl.kana:sl.ja,'F',0.95,'n');
  for(const p of (u.theysay||[])){ add(p.ja,p.tts,'M',1.05,'n'); add(p.ja,p.tts,'M',0.7,'s'); }
  if(u.branch) for(const n of Object.values(u.branch.nodes)) add(n.cat.ja,n.cat.tts,'F',1.0,'n');
  for(const l of u.dialog) if(!l.ref && l.who==='cat') add(l.ja,l.tts,'F',l.fast?1.25:l.slow?0.75:1.0,'n');
  for(const l of u.dialog) if(!l.ref && l.who==='me') { add(l.ja,l.kana,'F',1.0,'n'); add(l.ja,l.kana,'F',0.7,'s'); }
}
for(const st of (ctx.STORIES||[])) for(const l of st.lines){ add(l.ja,l.tts,'F',0.95,'n'); add(l.ja,l.tts,'F',0.7,'s'); }
add('こんにちは、よろしくおねがいします',null,'F',1.0,'n');

// dedupe: first definition of a key+kind wins (same as the app's phrase lookup)
const seen=new Set(), list=[];
for(const j of jobs){ const k=j.key+'|'+j.kind; if(seen.has(k)) continue; seen.add(k); list.push(j); }
for(const j of list) j.file=crypto.createHash('sha1').update(`${VOICES[j.voice][0]}|${j.rate}|${j.text}`).digest('hex').slice(0,16)+'.mp3';

fs.mkdirSync(OUT,{recursive:true});
const todo=list.filter(j=>!fs.existsSync(path.join(OUT,j.file)));
const chars=todo.reduce((a,j)=>a+[...j.text].length,0);
console.log(`${list.length} audiofragmenten, ${list.length-todo.length} al aanwezig, ${todo.length} nieuw (${chars} tekens)`);
if(DRY) process.exit(0);
if(todo.length && !KEY){ console.log('Geen GOOGLE_TTS_API_KEY: geen nieuwe opnames, de app gebruikt dan de telefoonstem.'); }
if(chars>MAX_CHARS){ console.error(`Te veel tekens in één keer (${chars} > ${MAX_CHARS}); verhoog TTS_MAX_CHARS bewust.`); process.exit(1); }

async function synth(j){
  for(const name of VOICES[j.voice]){
    const r=await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({input:{text:j.text},voice:{languageCode:'ja-JP',name},audioConfig:{audioEncoding:'MP3',speakingRate:j.rate,sampleRateHertz:24000}})});
    if(r.ok){ const d=await r.json(); fs.writeFileSync(path.join(OUT,j.file),Buffer.from(d.audioContent,'base64')); return; }
    const err=await r.text();
    if(r.status===400 && /voice|name/i.test(err)) continue;      // voice not available: try the next one
    throw new Error(`Google TTS ${r.status}: ${err.slice(0,300)}`);
  }
  throw new Error('Geen enkele stem beschikbaar voor '+j.text);
}
(async()=>{
  if(KEY) for(let i=0;i<todo.length;i+=4) await Promise.all(todo.slice(i,i+4).map(synth));
  const manifest={};
  for(const j of list) if(fs.existsSync(path.join(OUT,j.file))) (manifest[j.key] ||= {})[j.kind]=j.file;
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest));
  console.log(`manifest: ${Object.keys(manifest).length} teksten met opname`);
})().catch(e=>{ console.error(e.message); process.exit(1); });
