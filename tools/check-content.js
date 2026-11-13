// Checks the Japanese lesson content in index.html: kanji readings vs kana field (what the voice says),
// romaji vs pronunciation, duplicate meanings and dialog references. Run: node tools/check-content.js
const fs=require('fs'), vm=require('vm'), kuromoji=require('kuromoji'), wk=require('wanakana');
const src=fs.readFileSync(process.argv[2]||require('path').join(__dirname,'..','index.html'),'utf8');
const block=src.slice(src.indexOf('const UNITS = ['), src.indexOf('// global phrase lookup'));
const ctx={}; vm.runInNewContext(block.replace('const UNITS','UNITS'),ctx); const UNITS=ctx.UNITS;
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
  UNITS.forEach((u,ui)=>{
    u.phrases.forEach(p=>{
      const r=hira(reading(p.ja)), k=hira(p.kana);
      if(r!==k) issues.push(`[U${ui+1} lezing] ${p.ja}: analyser leest "${r}", kana-veld zegt "${k}"`);
      const pr=rnorm(toRomaji(pron(p.ja)).replace(/(.)-/g,'$1$1')), ro=rnorm(p.romaji);
      if(strip(p.kana).length<=3) { /* single short words (numbers): analyser guesses particles */ } else
      if(pr!==ro) issues.push(`[U${ui+1} romaji] ${p.ja}: uitspraak ≈ "${toRomaji(pron(p.ja))}", app zegt "${p.romaji}"`);
      if(seen[p.nl]) issues.push(`[dubbel] "${p.nl}" bij ${seen[p.nl]} en ${p.ja}`); seen[p.nl]=p.ja;
    });
    u.dialog.forEach(l=>{ if(l.ref||!l.romaji) return;
      const pr=rnorm(toRomaji(pron(l.ja)).replace(/(.)-/g,'$1$1')), ro=rnorm(l.romaji);
      if(pr!==ro) issues.push(`[U${ui+1} gesprek] ${l.ja}: uitspraak ≈ "${toRomaji(pron(l.ja))}", app zegt "${l.romaji}"`);
      if(l.ref && !u.phrases.concat(...UNITS.map(x=>x.phrases)).some(p=>p.ja===l.ref)) issues.push(`ref ontbreekt: ${l.ref}`);
    });
  });
  console.log(`${UNITS.reduce((a,u)=>a+u.phrases.length,0)} zinnen + ${UNITS.reduce((a,u)=>a+u.dialog.length,0)} gespreksregels gecontroleerd, ${issues.length} meldingen:`);
  issues.forEach(i=>console.log(' - '+i));
  process.exitCode = issues.length ? 1 : 0;
});
