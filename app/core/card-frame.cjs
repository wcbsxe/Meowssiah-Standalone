const fs=require('node:fs'),path=require('node:path');
let vendor;
const safe=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function bridge(seed){
  const callbacks=new Map(),events=new Map();let requestId=0,current=seed.current || {stat_data:{}};
  const notify=(type,payload={})=>parent.postMessage({meowFrame:true,nonce:seed.nonce,type,...payload},'*');
  const rpc=(action,payload={})=>new Promise((resolve,reject)=>{const id=++requestId;callbacks.set(id,{resolve,reject});notify('request',{id,action,...payload});setTimeout(()=>{if(callbacks.has(id)){callbacks.delete(id);reject(Error('本机状态操作超时。'));}},12000);});
  const copy=x=>JSON.parse(JSON.stringify(x));
  const on=(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);const stop=()=>events.set(name,(events.get(name)||[]).filter(f=>f!==fn));stop.stop=stop;return stop;};
  const emit=async(name,...args)=>{for(const fn of events.get(name)||[])await fn(...args);};
  window.addEventListener('message',e=>{
    if(e.source!==parent || !e.data?.meowFrame || e.data.nonce!==seed.nonce)return;
    if(e.data.type==='response'){const cb=callbacks.get(e.data.id);if(!cb)return;callbacks.delete(e.data.id);e.data.error?cb.reject(Error(e.data.error)):cb.resolve(e.data.value);}
  });
  window.addEventListener('error',e=>notify('error',{error:e.message}));window.addEventListener('unhandledrejection',e=>notify('error',{error:String(e.reason?.message || e.reason)}));
  const id=()=>seed.messageId;
  const messageIndex=options=>{let n=options?.message_id ?? seed.messageId;if(n==='latest')n=seed.messages.length-1;n=Number(n);return n<0?seed.messages.length+n:n;};
  const getVars=(options={})=>{
    if(options.type==='character')return copy(seed.characterVariables || {});
    if(options.type==='global')return copy(seed.globalVariables || {});
    if(options.type==='chat')return copy(seed.localVariables || {});
    const n=messageIndex(options);return copy(n===seed.messageId?current:seed.messages[n]?.data || {});
  };
  const replace=async(value,options={})=>{
    const before=getVars(options),saved=await rpc('replace',{value,options});
    if(options.type==='character')seed.characterVariables=copy(saved);
    else if(options.type==='global')seed.globalVariables=copy(saved);
    else if(options.type==='chat')seed.localVariables=copy(saved);
    else{const n=messageIndex(options);if(n===seed.messageId)current=copy(saved);if(seed.messages[n])seed.messages[n].data=copy(saved);await emit('mag_variable_update_ended',getVars(options),before);}
    return getVars(options);
  };
  const getMessages=selector=>{
    let index=selector==='latest'?seed.messages.length-1:Number(selector);if(index<0)index+=seed.messages.length;
    const m=seed.messages[index];return m?[{message_id:index,message:m.content,role:m.role,data:index===seed.messageId?getVars():copy(m.data || {}),variables:index===seed.messageId?getVars():copy(m.data || {})}]:[];
  };
  const vars=()=>({...seed.globalVariables,...seed.localVariables,...current});
  Object.assign(window,{getCurrentMessageId:id,getMessageId:id,getLastMessageId:()=>seed.messages.length-1,getVariables:getVars,getAllVariables:vars,
    replaceVariables:replace,insertOrAssignVariables:async(value,options)=>replace({...getVars(options),...value},options),updateVariablesWith:async(fn,options)=>replace(fn(getVars(options)),options),getChatMessages:getMessages,
    eventOn:on,eventMakeLast:on,eventMakeFirst:on,eventOnce:(name,fn)=>{const stop=on(name,(...args)=>{stop();return fn(...args)});return stop;},eventRemoveListener:(name,fn)=>events.set(name,(events.get(name)||[]).filter(f=>f!==fn)),eventEmit:emit,
    waitGlobalInitialized:()=>Promise.resolve(),initializeGlobal:(name,value)=>{window[name]=value;},waitUntil:async fn=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('等待条件尚未就绪');},
    tavern_events:{GENERATION_STARTED:'generation_started',GENERATION_ENDED:'generation_ended',GENERATION_STOPPED:'generation_stopped',CHAT_CHANGED:'chat_id_changed'},
    getvar:(key,options={})=>_.get(vars(),key,options.defaults),setvar:async(key,value)=>{const next=vars();_.set(next,key,value);await replace(next);return value;},
    toastr:{error:(message)=>notify('error',{error:String(message)}),warning:(message)=>notify('error',{error:String(message)}),success(){},info(){}},
    SillyTavern:{getContext:()=>({chat:seed.messages.map(m=>({mes:m.content,is_user:m.role==='user',variables:[m.data || {}]}))})}
  });
  window.Mvu={events:{VARIABLE_INITIALIZED:'mag_variable_initialized',VARIABLE_UPDATE_STARTED:'mag_variable_update_started',VARIABLE_UPDATE_ENDED:'mag_variable_update_ended',COMMAND_PARSED:'mag_command_parsed'},
    getMvuData:getVars,replaceMvuData:replace,getCurrentMvuData:getVars,replaceCurrentMvuData:replace,parseMessage:async(text,old)=>rpc('parse',{text,old}),isDuringExtraAnalysis:()=>false};
  let height=0,scheduled=false;const resize=()=>{scheduled=false;const h=Math.min(2000,Math.max(100,Math.ceil(Math.max(document.body?.scrollHeight || 0,document.body?.getBoundingClientRect().height || 0))));if(h!==height){height=h;notify('resize',{height:h});}};
  const schedule=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(resize);}};
  const observer=new ResizeObserver(schedule);observer.observe(document.documentElement);
  document.addEventListener('DOMContentLoaded',()=>{if(document.body)observer.observe(document.body);schedule();},{once:true});
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  // A card that fills the iframe must still let the surrounding chat scroll at its edges.
  document.addEventListener('wheel',event=>{
    if(event.ctrlKey||!event.deltaY)return;
    const dy=event.deltaY*(event.deltaMode===1?18:event.deltaMode===2?innerHeight:1);
    let node=event.target instanceof Element?event.target:null;
    while(node){const style=getComputedStyle(node),canScroll=/(auto|scroll)/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+1;
      if(canScroll&&((dy>0&&node.scrollTop+node.clientHeight<node.scrollHeight-1)||(dy<0&&node.scrollTop>0)))return;node=node.parentElement;}
    const root=document.scrollingElement;
    if(root&&getComputedStyle(document.documentElement).overflowY!=='hidden'&&((dy>0&&root.scrollTop+root.clientHeight<root.scrollHeight-1)||(dy<0&&root.scrollTop>0)))return;
    notify('scroll',{deltaY:dy});event.preventDefault();
  },{passive:false});
  window.addEventListener('load',()=>{schedule();emit('mag_variable_update_ended',current,current);});
}
function htmlDocument(html,seed){
  vendor ||= fs.readFileSync(path.join(__dirname,'../public/frame-vendor.js'),'utf8');
  let body=String(html).replace(/^\s*```(?:html)?\s*\n?/i,'').replace(/\n?```\s*$/,'');
  body=body.replace(/<script\b[^>]*\bsrc=["'][^"']*(?:jquery|lodash|zod|yaml)[^"']*["'][^>]*>\s*<\/script>/gi,'');
  const code=vendor+'\n;('+bridge.toString()+')('+safe(seed)+');';
  const head=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:transparent;color:inherit;font:14px/1.8 system-ui,"Microsoft YaHei",sans-serif}body{padding:8px}game{display:block;white-space:pre-wrap}UpdateVariable,JSONPatch,StatusPlaceHolderImpl{display:none}img{max-width:100%}</style><script>${code.replace(/<\/script/gi,'<\\/script')}</script>`;
  if(/<head\b[^>]*>/i.test(body))return body.replace(/<head\b[^>]*>/i,m=>m+head);
  return '<!doctype html><html><head>'+head+'</head><body>'+body+'</body></html>';
}
module.exports={htmlDocument};
