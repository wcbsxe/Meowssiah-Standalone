'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {getQuickJS}=require('quickjs-emscripten');
const L=require('./library.cjs');
let bundle;
function getBundle(){
  if(bundle)return bundle;
  const file=path.join(__dirname,'../vendor/card-runtime.js'),text=fs.readFileSync(file,'utf8');
  const expected=require('../data/integrations.json').hashes['app/vendor/card-runtime.js'];
  if(crypto.createHash('sha256').update(text).digest('hex')!==expected)throw Error('本地 MVU/EJS 运行器校验失败。');
  bundle=text;return bundle;
}
async function run(seed){
  const quick=await getQuickJS(),runtime=quick.newRuntime();
  runtime.setMemoryLimit(256*1024*1024);runtime.setMaxStackSize(2*1024*1024);
  const deadline=Date.now()+8000;runtime.setInterruptHandler(()=>Date.now()>deadline);
  const vm=runtime.newContext();
  const evaluate=code=>{const result=vm.evalCode(code);if(result.error){const err=vm.dump(result.error);result.error.dispose();throw Error(err.message || JSON.stringify(err));}result.value.dispose();};
  const read=name=>{const h=vm.getProp(vm.global,name);try{return vm.dump(h);}finally{h.dispose();}};
  try{
    evaluate(getBundle());
    evaluate(`globalThis.__done=false;MeowCardRuntime.execute(${JSON.stringify(seed)}).then(value=>{globalThis.__result=JSON.stringify(value);globalThis.__done=true;},error=>{globalThis.__failure=String(error.message || error)+'\\n'+String(error.stack || '');globalThis.__done=true;});`);
    while(!read('__done')){
      const jobs=runtime.executePendingJobs();if(jobs.error){const err=vm.dump(jobs.error);jobs.error.dispose();throw Error(err.message || JSON.stringify(err));}
      if(Date.now()>deadline)throw Error('卡片 MVU/EJS 执行超过 8 秒，已中止本轮计算。');
      if(jobs.value===0&&!read('__done'))throw Error('卡片正在等待平台尚未实现的异步入口。');
    }
    const failure=read('__failure');if(failure)throw Error(String(failure));
    return JSON.parse(read('__result'));
  }finally{vm.dispose();runtime.dispose();}
}
function flattenScripts(input){
  const scripts=[];const visit=(x,parentEnabled=true)=>{if(!x || typeof x!=='object')return;if(Array.isArray(x)){for(const v of x)visit(v,parentEnabled);return;}
    const enabled=parentEnabled&&x.enabled!==false;
    if(typeof x.content==='string' && (x.type==='script' || x.id || x.name))scripts.push({id:String(x.id || 'script-'+scripts.length),name:String(x.name || ''),enabled,content:x.content});
    else for(const key of ['scripts','value','children','items'])if(x[key])visit(x[key],enabled);};visit(input);return scripts.slice(0,100);
}
function snapshot(session){
  const prior=[...session.messages].reverse().find(m=>m.role==='assistant'&&(m.runtime?.after?.stat_data || m.variables?.[0]?.stat_data));
  return {current:prior?.runtime?.after || prior?.variables?.[0] || session.runtime?.initial || null,
    localVariables:prior?.runtime?.localVariables || session.runtime?.localVariables || {}};
}
function seedFor(state,session){
  const profile=L.resolveProfile(state,session),books=L.selectedBooks(state,session),previous=snapshot(session);
  const chat=session.messages.map(m=>({id:m.id,mes:m.renderedContent || m.content,is_user:m.role==='user',is_system:false,name:m.role==='user'?profile.userName:profile.name,
    swipe_id:0,swipes:[m.content],variables:[m.runtime?.after || m.variables?.[0] || {}]}));
  if(!chat.length)chat.push({mes:profile.firstMessage || '',is_user:false,swipe_id:0,swipes:[''],variables:[{}]});
  const character=state.library?.characters.find(c=>c.id===session.characterId);
  return {profile,books,chat,sessionId:session.id,characterVariables:character?.variables || {},current:previous.current,localVariables:previous.localVariables,
    globalVariables:state.library?.globalVariables || {},model:state.settings.model,
    lastUser:session.messages.findLast(m=>m.role==='user')?.content || '',compat:profile.compat || {},scripts:profile.helperScripts || []};
}
function needed(seed){return seed.compat.mvu || seed.compat.ejs || seed.scripts.some(s=>s.enabled) || seed.profile.regexes?.length;}
async function prepare(state,session,prompts){
  const seed=seedFor(state,session);
  if(!needed(seed))return {profile:seed.profile,books:seed.books,promptStates:state.promptStates,current:seed.current,warnings:[],errors:[]};
  return run({...seed,phase:'prepare',prompts,promptStates:state.promptStates});
}
async function complete(state,session,content,{current}={}){
  const seed=seedFor(state,session);if(current)seed.current=current;
  if(!needed(seed))return {before:seed.current,current:seed.current,displayContent:content,renderedContent:content,warnings:[],errors:[],commands:[]};
  return run({...seed,phase:'complete',content});
}
module.exports={run,prepare,complete,flattenScripts,snapshot,seedFor};
