'use strict';
const {createHash,randomUUID}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,20);
const clone=x=>JSON.parse(JSON.stringify(x));
function normalizeLibrary(input,sessions,normalizeProfile,normalizeEntries){
  const library={version:1,worldbooks:[],characters:[],globalVariables:clone(input?.globalVariables || {})};
  const seen=new Set();
  for(const b of (input?.worldbooks || []).slice(0,1000)){
    const id=String(b.id || randomUUID()).slice(0,120);if(seen.has(id))continue;seen.add(id);
    library.worldbooks.push({id,name:String(b.name || '未命名世界书').slice(0,200),entries:normalizeEntries(b.entries || []),
      source:String(b.source || '用户创建').slice(0,500),createdAt:Number(b.createdAt)||Date.now(),updatedAt:Number(b.updatedAt)||Date.now()});
  }
  const addEmbedded=p=>{
    if(!p.worldbook.length)return null;const key='embedded_'+hash(p.worldbook);
    if(!library.worldbooks.some(b=>b.id===key))library.worldbooks.push({id:key,name:p.name+' · 内置世界书',entries:clone(p.worldbook),source:'角色卡内置',createdAt:Date.now(),updatedAt:Date.now()});
    return key;
  };
  for(const c of (input?.characters || []).slice(0,500)){
    if(library.characters.some(v=>v.id===String(c.id)))continue;
    const p=normalizeProfile(c.profile || {}),id=String(c.id || randomUUID()).slice(0,120);
    let ids=Array.isArray(c.enabledWorldbookIds)?c.enabledWorldbookIds.map(String):[addEmbedded(p)].filter(Boolean);
    ids=[...new Set(ids)].filter(id=>library.worldbooks.some(b=>b.id===id));
    library.characters.push({id,name:p.name,profile:p,variables:clone(c.variables || {}),enabledWorldbookIds:ids,createdAt:Number(c.createdAt)||Date.now(),updatedAt:Number(c.updatedAt)||Date.now()});
  }
  for(const s of sessions){
    let c=library.characters.find(c=>c.id===s.characterId);
    if(!c){
      const id='char_'+hash(s.profile);c=library.characters.find(c=>c.id===id);
      if(!c){const bookId=addEmbedded(s.profile);c={id,name:s.profile.name,profile:clone(s.profile),enabledWorldbookIds:bookId?[bookId]:[],createdAt:s.createdAt,updatedAt:s.updatedAt};library.characters.push(c);}
      s.characterId=c.id;
    }
    // Card definitions and book selections are shared; message variables remain per story.
    s.profile=clone(c.profile);
  }
  return library;
}
function selectedBooks(state,session){
  const c=state.library?.characters.find(c=>c.id===session.characterId);
  if(!c)return session.profile.worldbook?.length?[{id:'legacy',name:session.profile.name+' · 内置世界书',entries:session.profile.worldbook}]:[];
  return c.enabledWorldbookIds.map(id=>state.library.worldbooks.find(b=>b.id===id)).filter(Boolean);
}
function resolveProfile(state,session){
  const c=state.library?.characters.find(c=>c.id===session.characterId);
  const p=clone(c?.profile || session.profile);
  p.worldbook=selectedBooks(state,session).flatMap(b=>b.entries.map(e=>({...e,sourceBook:b.name,sourceBookId:b.id})));
  return p;
}
module.exports={normalizeLibrary,selectedBooks,resolveProfile,hash};
