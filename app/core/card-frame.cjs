const fs=require('node:fs'),path=require('node:path');
let vendor;
const safe=x=>JSON.stringify(x).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
function bridge(seed){
  const callbacks=new Map(),events=new Map();let requestId=0,current=seed.current || {stat_data:{}};
  const notify=(type,payload={})=>parent.postMessage({meowFrame:true,nonce:seed.nonce,type,...payload},'*');
  const rpc=(action,payload={})=>new Promise((resolve,reject)=>{const id=++requestId;callbacks.set(id,{resolve,reject});notify('request',{id,action,...payload});setTimeout(()=>{if(callbacks.has(id)){callbacks.delete(id);reject(Error('本机状态操作超时。'));}},12000);});
  const copy=x=>JSON.parse(JSON.stringify(x));
  const on=(name,fn)=>{const list=events.get(name)||[];list.push(fn);events.set(name,list);return ()=>events.set(name,list.filter(f=>f!==fn));};
  const emit=async(name,...args)=>{for(const fn of events.get(name)||[])await fn(...args);};
  window.addEventListener('message',e=>{
    if(e.source!==parent || !e.data?.meowFrame || e.data.nonce!==seed.nonce)return;
    if(e.data.type==='response'){const cb=callbacks.get(e.data.id);if(!cb)return;callbacks.delete(e.data.id);e.data.error?cb.reject(Error(e.data.error)):cb.resolve(e.data.value);}
  });
  window.addEventListener('error',e=>notify('error',{error:e.message}));window.addEventListener('unhandledrejection',e=>notify('error',{error:String(e.reason?.message || e.reason)}));
  const id=()=>seed.messageId;
  const getVars=()=>copy(current);
  const replace=async value=>{const before=copy(current);await rpc('replace',{value});current=copy(value);await emit('mag_variable_update_ended',current,before);};
  const getMessages=selector=>{
    let index=selector==='latest'?seed.messages.length-1:Number(selector);if(index<0)index+=seed.messages.length;
    const m=seed.messages[index];return m?[{message_id:index,message:m.content,role:m.role,data:index===seed.messageId?getVars():copy(m.data || {}),variables:index===seed.messageId?getVars():copy(m.data || {})}]:[];
  };
  const vars=()=>({...seed.globalVariables,...seed.localVariables,...current});
  Object.assign(window,{getCurrentMessageId:id,getMessageId:id,getLastMessageId:()=>seed.messages.length-1,getVariables:getVars,getAllVariables:vars,
    replaceVariables:replace,insertOrAssignVariables:async value=>replace({...current,...value}),updateVariablesWith:async fn=>replace(fn(copy(current))),getChatMessages:getMessages,
    eventOn:on,eventMakeLast:on,eventMakeFirst:on,eventOnce:(name,fn)=>{const stop=on(name,(...args)=>{stop();return fn(...args)});return stop;},eventRemoveListener:(name,fn)=>events.set(name,(events.get(name)||[]).filter(f=>f!==fn)),eventEmit:emit,
    waitGlobalInitialized:()=>Promise.resolve(),waitUntil:async fn=>{for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('等待条件尚未就绪');},
    getvar:(key,options={})=>_.get(vars(),key,options.defaults),setvar:async(key,value)=>{const next=vars();_.set(next,key,value);await replace(next);return value;},
    toastr:{error:(message)=>notify('error',{error:String(message)}),warning:(message)=>notify('error',{error:String(message)}),success(){},info(){}},
    SillyTavern:{getContext:()=>({chat:seed.messages.map(m=>({mes:m.content,is_user:m.role==='user',variables:[m.data || {}]}))})}
  });
  window.Mvu={events:{VARIABLE_INITIALIZED:'mag_variable_initialized',VARIABLE_UPDATE_STARTED:'mag_variable_update_started',VARIABLE_UPDATE_ENDED:'mag_variable_update_ended',COMMAND_PARSED:'mag_command_parsed'},
    getMvuData:getVars,replaceMvuData:replace,getCurrentMvuData:getVars,replaceCurrentMvuData:replace,parseMessage:async(text,old)=>rpc('parse',{text,old}),isDuringExtraAnalysis:()=>false};
  let height=0;const resize=()=>{const h=Math.min(2000,Math.max(100,Math.ceil(Math.max(document.body?.scrollHeight || 0,document.body?.getBoundingClientRect().height || 0)+3)));if(h!==height){height=h;notify('resize',{height:h});}};
  new ResizeObserver(resize).observe(document.documentElement);window.addEventListener('load',()=>{resize();emit('mag_variable_update_ended',current,current);});
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
