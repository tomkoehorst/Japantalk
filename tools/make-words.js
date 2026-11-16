// Splits every phrase into words (with how you say each word) for the per-word feedback in the app.
// Output: <dir>/words.json  { "お名前は何ですか": [["お名前","おなまえ","o-namae"],["は","わ","wa"], ...], ... }
// Run: node tools/make-words.js www
const fs=require('fs'), path=require('path'), vm=require('vm'), kuromoji=require('kuromoji'), wk=require('wanakana');
const out=path.join(process.argv[2]||'www','words.json');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const block=src.slice(src.indexOf('const UNITS = ['), src.indexOf('// global phrase lookup'));
const ctx={ME:{kata:'トム',romaji:'Tomu',nl:'Tom'}, BUDDY:{id:'neko',name:'Neko',ja:'ネコ',romaji:'Neko'}};
vm.runInNewContext(block.replace('const UNITS','UNITS').replace('const STORIES','STORIES'),ctx);
const romaji=k=>wk.toRomaji(k).replace(/([aiueo])ー/g,(m,v)=>({a:'ā',i:'ii',u:'ū',e:'ē',o:'ō'})[v]).replace(/ou(?=$|[^aiueo])/g,'ō').replace(/ー/g,'');
kuromoji.builder({dicPath:require.resolve('kuromoji').replace(/src.*$/,'dict')}).build((err,tk)=>{
  if(err) throw err;
  const phrases=[]; ctx.UNITS.forEach(u=>{ phrases.push(...u.phrases, ...ctx.expandPattern(u.pattern), ...(u.theysay||[])); });
  const words={};
  for(const p of phrases){
    if(words[p.ja]) continue;
    const said=p.tts||p.ja;
    if(said!==p.ja && said.replace(/[、。！？]/g,'')!==p.ja.replace(/[、。！？]/g,'')) { /* voice text differs (kana spelling): split the written form, read it via the voice text */ }
    const toks=tk.tokenize(p.ja).filter(t=>t.pos!=='記号');
    const W=[];
    for(let i=0;i<toks.length;i++){
      const t=toks[i], s=t.surface_form, pron=wk.toHiragana(t.pronunciation||t.reading||s), prev=W[W.length-1];
      const glue = prev && ( t.pos==='助動詞' && !['名詞','助詞'].includes(toks[i-1].pos)    // 行き+ます, 食べ+られません
                    || t.pos_detail_1==='接尾' || t.pos_detail_1==='非自立' && t.pos!=='名詞' && t.pos!=='動詞'
                    || (t.pos==='助詞' && t.pos_detail_1==='接続助詞' && ['て','で'].includes(s)) );   // 見せ+て
      if(glue || (prev && s==='ん')){ prev[0]+=s; prev[1]+=pron; }
      else if(toks[i-1] && toks[i-1].pos==='接頭詞' && prev){ prev[0]+=s; prev[1]+=pron; }   // お+名前
      else W.push([s,pron]);
    }
    // use the hand-written romaji when its words line up with ours
    const rw=(p.romaji||'').replace(/[.,!?…]/g,'').trim().split(/\s+/).filter(Boolean);
    words[p.ja]=W.map(([s,k],i)=>[s,k, rw.length===W.length ? rw[i] : romaji(k).replace(/uu/g,'ū')]);
  }
  fs.writeFileSync(out, JSON.stringify(words));
  console.log(`${Object.keys(words).length} zinnen in woorden gesplitst → ${out}`);
});
