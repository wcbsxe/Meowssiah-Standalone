'use strict';
// Executes only the fixed, hash-checked bundled preset functions, not imported card code.
// All host objects/functions are constructed inside the VM; no Node/network APIs are exposed.
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=require('../data/original.json');
const hashes=require('../data/script-hashes.json');
const fields={FinalRequestProcessing:source.extensions.SPreset.FinalRequestProcessing.script,
  OutputPreprocessing:source.extensions.SPreset.OutputPreprocessing.script,
  ToolFormatter:source.extensions.SPreset.OutputPreprocessing.toolCallFormatter.script};
for(const [name,code] of Object.entries(fields)){
  if(crypto.createHash('sha256').update(code).digest('hex')!==hashes[name])throw new Error(`原版脚本校验失败：${name}`);
}
function isolate(seed,body){
  const context=vm.createContext(Object.create(null),{codeGeneration:{strings:false,wasm:false}});
  const init=`'use strict';const seed=${JSON.stringify(seed)};const console={log(){},warn(){},error(){},info(){},debug(){}};`;
  const result=new vm.Script(init+body,{filename:'meowssiah-original-runtime.js'}).runInContext(context,{timeout:2500});
  return JSON.parse(result);
}
function originalRewrite({request,settings,chat,metadata,oracle,worldEntries,chatId}){
  return isolate({request,settings,chat,metadata,oracle,worldEntries,chatId},`
    const ctx={chatCompletionSettings:seed.settings,chat:seed.chat,chatMetadata:seed.metadata,chatId:seed.chatId,
      getCurrentChatId:()=>seed.chatId,saveMetadataDebounced(){},eventTypes:{},eventSource:{on(){}}};
    const window={SillyTavern:{getContext:()=>ctx},CatGodOracle:{state:seed.oracle},
      localStorage:{getItem:()=>JSON.stringify(seed.oracle)},dispatchEvent(){},CustomEvent:class{constructor(name,options){this.type=name;this.detail=options.detail;}},
      __catgodLastActivatedWi:{entries:seed.worldEntries,chatId:seed.chatId,updatedAt:Date.now()}};
    window.top=window;window.parent=window;
    const result=(${fields.FinalRequestProcessing})({request:seed.request});
    JSON.stringify({request:result,metadata:ctx.chatMetadata,extras:ctx.chat.map(m=>m.extra || {})});
  `);
}
function originalFormat(calls,defaultText=''){
  // SPreset accepts a function expression with an optional trailing semicolon.
  const expression=fields.ToolFormatter.trim().replace(/;+$/,'');
  return isolate({calls,defaultText},`JSON.stringify((${expression})({calls:seed.calls,defaultText:seed.defaultText}));`);
}
function originalOutput(buffer,final=false){
  return isolate({buffer,final},`JSON.stringify((${fields.OutputPreprocessing})({buffer:seed.buffer,final:seed.final,state:{}}));`);
}
function replyTool(){
  const binding=Object.values(source.extensions.SPreset.ToolBindings).find(x=>x.enabled);
  return isolate({},`const obj=(function(){${binding.code}})();JSON.stringify({type:'function',function:{name:obj.name,description:obj.description,parameters:obj.parameters}});`);
}
module.exports={source,hashes,originalRewrite,originalFormat,originalOutput,replyTool};
