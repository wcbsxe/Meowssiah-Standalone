'use strict';
const {formatToolCalls,sanitizeUsage}=require('./engine.cjs');
const Original=require('./original-runtime.cjs');
function endpoint(base,part){
  let url;try{url=new URL(String(base).trim());}catch{throw new Error('请填写完整接口地址，例如 https://服务地址/v1。');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error('接口地址只接受 http/https，密钥请放在单独的密钥输入框。');
  if(url.protocol==='http:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('远程接口请使用 HTTPS，HTTP 仅用于本机模型。');
  url.pathname=url.pathname.replace(/\/(?:chat\/completions|models)\/?$/,'').replace(/\/$/,'')+'/'+part;
  return url.toString();
}
function headers(key){return {'Content-Type':'application/json',...(key?{Authorization:`Bearer ${key}`}:{})};}
function cleanError(s,key){let value=String(s || '接口请求失败。');if(key)value=value.split(key).join('[密钥已隐藏]');return value.slice(0,1000);}
async function responseError(res,key){
  let details='';try {const s=await res.text();try{const j=JSON.parse(s);details=j.error?.message || j.message || `HTTP ${res.status}`;}catch{details=`HTTP ${res.status}，接口没有返回 JSON 错误信息。`;}}catch{}
  return new Error(cleanError(`接口返回 ${res.status}：${details}`,key));
}
async function models(config,key,signal){
  const res=await fetch(endpoint(config.baseUrl,'models'),{headers:headers(key),signal,redirect:'error'});
  if(!res.ok) throw await responseError(res,key);
  const body=await res.json();
  return (body.data || []).map(x=>String(x.id || '')).filter(Boolean).slice(0,2000);
}
async function generate(config,key,body,signal,emit){
  const res=await fetch(endpoint(config.baseUrl,'chat/completions'),{method:'POST',headers:headers(key),body:JSON.stringify(body),signal,redirect:'error'});
  if(!res.ok) throw await responseError(res,key);
  let complete='',usage=null,finishReason=null,lastFormatted='';const calls=new Map();
  const ingest=j=>{
    if(j.error) throw new Error(cleanError(j.error.message || '流式接口返回错误。',key));
    if(j.usage)usage=sanitizeUsage(j.usage);
    const choice=j.choices?.[0];if(!choice)return;
    if(choice.finish_reason)finishReason=choice.finish_reason;
    const d=choice.delta || choice.message || {};
    const val=typeof d.content==='string'?d.content:Array.isArray(d.content)?d.content.filter(p=>p.type==='text').map(p=>p.text).join(''):'';
    if(val){complete+=val;emit({type:'delta',text:val});}
    // Only decode returned story fields; never execute arbitrary model tool requests.
    for(const [i,t] of (d.tool_calls || []).entries()) {
      const index=t.index ?? i,call=calls.get(index) || {function:{name:'',arguments:''}};
      if(t.function?.name)call.function.name+=t.function.name;
      if(t.function?.arguments)call.function.arguments+=t.function.arguments;
      const sig=t.extra_content?.google?.thought_signature || t.extra_content?.google?.thoughtSignature || t.thought_signature || t.thoughtSignature || t.signature;
      if(sig)call.signature=sig;
      calls.set(index,call);
    }
    if(calls.size){const formatted=Original.originalFormat([...calls.values()].map(c=>({name:c.function.name,arguments:c.function.arguments})),complete);if(formatted!==lastFormatted){lastFormatted=formatted;emit({type:'replace',text:formatted});}}
  };
  if((res.headers.get('content-type') || '').includes('text/event-stream')) {
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',doneEvent=false;
    const block=raw=>{
      const data=raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n').trim();
      if(!data || data==='[DONE]'){if(data==='[DONE]')doneEvent=true;return;}
      let j;try{j=JSON.parse(data);}catch{throw new Error('接口返回了损坏的流式 JSON，已保留收到的正文。');}ingest(j);
    };
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');let boundary;
      while((boundary=buffer.indexOf('\n\n'))!==-1){block(buffer.slice(0,boundary));buffer=buffer.slice(boundary+2);}
      if(buffer.length>2*1024*1024)throw new Error('接口的单个流式事件超过 2MB。');
    }
    buffer+=decoder.decode();if(buffer.trim())block(buffer);
    if(!doneEvent&&!finishReason)throw new Error('接口连接提前结束，没有收到完成标志。已保留收到的正文，可点击重试。');
  }else ingest(await res.json());
  const toolText=Original.originalFormat([...calls.values()].map(c=>({name:c.function.name,arguments:c.function.arguments})),complete);
  if(calls.size && toolText){complete=toolText;emit({type:'replace',text:toolText});}
  complete=Original.originalOutput(complete,true).output;
  if(!complete.trim())throw new Error('接口没有返回正文。请检查模型、输出格式或接口是否兼容 Chat Completions。');
  const primary=[...calls.values()].find(c=>c.function.name==='soliumbra_reply');
  return {content:complete,usage,finishReason,...(primary?{providerCall:{content:complete,function:primary.function,signature:primary.signature || ''}}:{})};
}
module.exports={endpoint,models,generate,cleanError};
