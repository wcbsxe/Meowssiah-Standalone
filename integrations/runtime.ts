import {_,YAML,ENV,configure,chat,chat_metadata,extension_settings,toastr,console} from './host';
import {updateVariables,extractCommands} from '../upstream/mvu/src/function/update_variables';
import {loadInitVarData,createEmptyGameData} from '../upstream/mvu/src/function/initvar/variable_init';
import {generateSchema,cleanUpMetadata} from '../upstream/mvu/src/function/schema';
import {variable_events} from '../upstream/mvu/src/variable_def';
import {registerMvuSchema} from '../upstream/mvu-zod/mvu_zod';
import {parseString,correctlyMerge} from '../upstream/mvu-zod/common';
import * as V from '../upstream/prompt-template/src/function/variables';
import ejs from '../upstream/prompt-template/src/3rdparty/ejs.js';
import * as z from 'zod';
import * as jsonpatch from 'fast-json-patch';
import {jsonPatch as templateJsonPatch,patchVariables as templatePatchVariables,parseJSON as templateParseJSON} from '../upstream/prompt-template/src/function/json-patch';
import {selectEntries} from '../app/core/worldbook.cjs';

let current:any, listeners:Map<string,Function[]>, ready:Promise<any>[], scope:any, entryDepth=0;
const clone=(x:any)=>_.cloneDeep(x);
function install(seed:any){
  configure({...seed,errors:[],warnings:[]});listeners=new Map();ready=[];
  current=clone(seed.current || createEmptyGameData());
  const g=globalThis as any;
  // Tavern bundles expose both z.string and namespace-style z.z.string.
  const zCompat:any=new Proxy(z,{get(target,key){return key==='z'||key==='default'?zCompat:Reflect.get(target,key);}});
  const on=(name:string,fn:Function)=>{const arr=listeners.get(name)||[];arr.push(fn);listeners.set(name,arr);const stop=()=>off(name,fn);stop.stop=stop;return stop;};
  const off=(name:string,fn:Function)=>listeners.set(name,(listeners.get(name)||[]).filter(f=>f!==fn));
  const emit=async(name:string,...args:any[])=>{for(const fn of [...(listeners.get(name)||[])])await fn(...args);};
  g.__meowOn=on;g.__meowOff=off;g.__meowEmit=emit;
  const jq:any=(arg:any)=>{if(typeof arg==='function'){try{ready.push(Promise.resolve(arg()));}catch(e){ready.push(Promise.reject(e));}}return {length:0,prop:()=>false,on(){return this},off(){return this},ready(fn:Function){ready.push(Promise.resolve(fn()));return this}};};
  jq.extend=_.assign;jq.get=()=>{throw Error('卡片网络请求未映射到本机组件');};
  const readVars=(options:any={type:'chat'})=>{
    if(options.type==='global')return extension_settings.variables.global;
    if(options.type==='character')return ENV.characterVariables;
    if(options.type!=='message')return chat_metadata.variables;
    let n=options.message_id;if(n===undefined||n==='latest')return current;n=Number(n);if(n<0)n+=chat.length;
    return n===chat.length-1?current:chat[n]?.variables?.[0] || {};
  };
  const replaceVars=(value:any,options:any={type:'chat'})=>{if(options.type==='global')extension_settings.variables.global=value;else if(options.type==='message')current=value;else if(options.type==='character')ENV.characterVariables=value;else chat_metadata.variables=value;return Promise.resolve();};
  Object.assign(g,{_,z:zCompat,YAML,console,toastr,$:jq,eventOn:on,eventEmit:emit,eventRemoveListener:off,eventMakeLast:on,eventMakeFirst:on,eventOnce:(name:string,fn:Function)=>{const stop=on(name,(...args:any[])=>{stop();return fn(...args)});return stop;},
    addEventListener:on,removeEventListener:off,
    initializeGlobal:(name:string,value:any)=>{g[name]=value;},
    errorCatched:(fn:Function)=>(...args:any[])=>{const task=Promise.resolve().then(()=>fn(...args));ready.push(task);return task;},
    tavern_events:{GENERATION_AFTER_COMMANDS:'generation_after_commands',CHAT_CHANGED:'chat_id_changed',CHAT_COMPLETION_SETTINGS_READY:'chat_completion_settings_ready',GENERATION_STARTED:'generation_started',GENERATION_ENDED:'generation_ended',GENERATION_STOPPED:'generation_stopped'},
    injectPrompts:(prompts:any[])=>{ENV.injectedPrompts ||= [];for(const p of prompts || []){ENV.injectedPrompts=ENV.injectedPrompts.filter((x:any)=>x.id!==p.id);ENV.injectedPrompts.push(clone(p));}},
    uninjectPrompts:(ids:string[])=>{ENV.injectedPrompts=(ENV.injectedPrompts || []).filter((p:any)=>!ids.includes(p.id));},
    getVariables:readVars,getAllVariables:()=>({...extension_settings.variables.global,...chat_metadata.variables,...current}),replaceVariables:replaceVars,
    updateVariablesWith:async(fn:Function,o:any)=>replaceVars(fn(readVars(o)),o),insertOrAssignVariables:async(v:any,o:any)=>replaceVars({...readVars(o),...v},o),
    getCurrentMessageId:()=>chat.length-1,getMessageId:()=>chat.length-1,getLastMessageId:()=>chat.length-1,getScriptId:()=>ENV.scriptId || 'card-local',
    registerVariableSchema(){},waitGlobalInitialized:()=>Promise.resolve(),waitUntil:async(fn:Function)=>{if(!fn())throw Error('等待条件尚未就绪');},
    getChatMessages:(id:any='latest',options:any={})=>{
      const range=String(id).match(/^(\d+)-(\d+)$/);let start=id==='latest'?chat.length-1:Number(id),end=start;if(start<0)start=end=chat.length+start;
      if(range){start=Number(range[1]);end=Number(range[2]);}
      return chat.map((m:any,n:number)=>({...m,message_id:n,message:m.mes,role:m.is_user?'user':'assistant',data:m.variables?.[0]||current})).filter((m:any)=>m.message_id>=start&&m.message_id<=end&&(!options.role||m.role===options.role));
    },
    getCharWorldbookNames:()=>({primary:ENV.books[0]?.name || null,additional:ENV.books.slice(1).map((b:any)=>b.name)}),
    getCharLorebooks:async()=>({primary:ENV.books[0]?.name || null,additional:ENV.books.slice(1).map((b:any)=>b.name)}),
    getLorebookSettings:()=>({selected_global_lorebooks:[],scan_depth:8,recursive_scan:false}),
    getLorebookEntries:async(name:string)=>ENV.books.find((b:any)=>b.name===name)?.entries.map((e:any)=>({...e,comment:e.name})) || [],
    getWorldbook:async(name:string)=>ENV.books.find((b:any)=>b.name===name)?.entries || [],
    getCurrentChatId:()=>ENV.sessionId,
    SillyTavern:{chat,chatMetadata:chat_metadata,saveChat(){},getContext(){return {chat,chatMetadata:chat_metadata,chatId:ENV.sessionId}}},
  });g.window=g;g.parent=g;
  const mvu={events:variable_events,getMvuData:readVars,replaceMvuData:replaceVars,
    getCurrentMvuData:()=>current,replaceCurrentMvuData:(v:any)=>{current=v;return Promise.resolve();},
    parseMessage:async(text:string,old:any)=>{const value=clone(old);await updateVariables(text,value,ENV.errors);return value;},
    reloadInitVar:(v:any)=>loadInitVarData(v),isDuringExtraAnalysis:()=>false};
  g.Mvu=mvu;g.registerMvuSchema=registerMvuSchema;
  g.__meowMacros=(raw:string)=>String(raw).replace(/\{\{(?:get_message_variable|getvar|getchatvar)::([^}]+)\}\}/gi,(_all,key)=>{
    const value=_.get({...chat_metadata.variables,...current},key.trim());return typeof value==='string'?value:JSON.stringify(value ?? '');
  }).replace(/\{\{(user|char|description|personality|scenario|persona|lastUserMessage)\}\}/gi,(_all,key)=>{
    const p=ENV.profile;return ({user:p.userName,char:p.name,description:p.description,personality:p.personality,scenario:p.scenario,persona:p.persona,lastusermessage:ENV.lastUser || ''} as any)[key.toLowerCase()] ?? '';
  });
}
function mapImports(code:string){
  const lookup=(url:string)=>{
    if(/mvu_zod(?:\.(?:js|ts))?(?:\?|$)/i.test(url))return '({registerMvuSchema:globalThis.registerMvuSchema})';
    if(/(?:^|\/)zod(?:@|\/|$)/i.test(url))return 'globalThis.z';
    if(/(?:^|\/)lodash(?:-es)?(?:@|\/|$)/i.test(url))return 'globalThis._';
    if(/(?:^|\/)yaml(?:@|\/|$)/i.test(url))return 'globalThis.YAML';
    if(/MagVarUpdate|mag-var-update|mvu.*bundle/i.test(url))return 'globalThis.Mvu';
    throw Error('脚本依赖尚未映射：'+url);
  };
  const bindingPattern=String.raw`(?:\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?)`;
  let value=code.replace(new RegExp(String.raw`\bimport\s*(${bindingPattern})\s*from\s*['"]([^'"]+)['"]\s*;?`,'g'),(_all,binding,url)=>{
    let b=String(binding).trim();if(b.startsWith('{'))b=b.replace(/\bas\b/g,':');else if(b.startsWith('* as '))b=b.slice(5);
    return `const ${b} = ${lookup(url)};`;
  });
  value=value.replace(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,(_all,url)=>`Promise.resolve(${lookup(url)})`);
  value=value.replace(/import\s*['"]([^'"]+)['"]\s*;?/g,(_all,url)=>{lookup(url);return '';});
  return value.replace(/^\s*export\s+(?=(?:const|let|var|function|class)\b)/gm,'').replace(/^\s*export\s*\{[^}]*\};?\s*$/gm,'');
}
async function runScripts(){
  for(const script of ENV.scripts || []){
    if(script.enabled===false || !script.content?.trim())continue;
    if(/MagVarUpdate.*(?:artifact|bundle)|mvu_zod\.js/.test(script.content) && !/registerMvuSchema\s*\(/.test(script.content)){
      // A framework loader is replaced by the already loaded, pinned local core.
      if(!/registerMvuSchema|eventOn\(|const\s+Schema|let\s+Schema/.test(script.content))continue;
    }
    try{ENV.scriptId=script.id;await (new Function('return (async()=>{'+mapImports(script.content)+'\n})()'))();while(ready.length){const pending=ready;ready=[];await Promise.all(pending);}}
    catch(e:any){throw Error(`角色脚本「${script.name || script.id}」：${e.message}`);}
  }
}
function setupTemplate(phase:string){
  const last=chat.at(-1);if(last){last.variables ||= [{}];last.variables[0]={...last.variables[0],...current};last.swipe_id=0;last.swipes ||= [last.mes];}
  V.STATE.initialVariables={};
  for(const b of ENV.books)for(const e of b.entries)if(/\[InitialVariables\]/i.test(e.name))correctlyMerge(V.STATE.initialVariables,parseString(e.content));
  V.precacheVariables(chat.length-1);V.STATE.isDryRun=phase==='prepare';
  scope={_,z,YAML,console,toastr,runID:1,message_id:chat.length-1,user:ENV.profile.userName,char:ENV.profile.name,model:ENV.model || '',
    getvar:(...a:any[])=>V.getVariable.call(scope,...a),setvar:(...a:any[])=>V.setVariable.call(scope,...a),
    incvar:(...a:any[])=>V.increaseVariable.call(scope,...a),decvar:(...a:any[])=>V.decreaseVariable.call(scope,...a),
    delvar:(...a:any[])=>V.removeVariable.call(scope,...a),insvar:(...a:any[])=>V.insertVariable.call(scope,...a),
    getLocalVar:(k:any,o:any={})=>V.getVariable.call(scope,k,{...o,scope:'local'}),getGlobalVar:(k:any,o:any={})=>V.getVariable.call(scope,k,{...o,scope:'global'}),getMessageVar:(k:any,o:any={})=>V.getVariable.call(scope,k,{...o,scope:'message'}),
    setLocalVar:(k:any,v:any,o:any={})=>V.setVariable.call(scope,k,v,{...o,scope:'local'}),setGlobalVar:(k:any,v:any,o:any={})=>V.setVariable.call(scope,k,v,{...o,scope:'global'}),setMessageVar:(k:any,v:any,o:any={})=>V.setVariable.call(scope,k,v,{...o,scope:'message'}),
    getwi:async(...args:any[])=>{
      if(entryDepth>16)throw Error('getwi 世界书引用超过 16 层');
      const book=args.length>1?args[0]:null,title=args.length>1?args[1]:args[0];
      const entries=ENV.books.filter((b:any)=>!book || b.name===book).flatMap((b:any)=>b.entries);
      const entry=entries.find((e:any)=>e.name===title || String(e.id)===String(title));if(!entry)return '';
      entryDepth++;try{return await render(entry.content,'世界书引用 '+title);}finally{entryDepth--;}
    },
    getEnabledLoreBooks:()=>ENV.books.map((b:any)=>b.name),getchar:()=>clone(ENV.profile),getCharaData:()=>clone(ENV.profile),
    getChatMessages:(globalThis as any).getChatMessages,getAllVariables:(globalThis as any).getAllVariables,
    print:()=>{},echo:()=>{},
    jsonPatch:templateJsonPatch,patchVariables:(...a:any[])=>templatePatchVariables.call(scope,...a),
    parseJSON:templateParseJSON,setVariableSchema:V.setVariableSchema,dumpYaml:V.dumpYamlWithSchema,applyVarYamlAnnotate:(...a:any[])=>V.dumpYamlWithSchema.call(scope,...a),
  };
  for(const [label,type] of [['Local','local'],['Global','global'],['Message','message']]){
    scope['inc'+label+'Var']=(k:any,v=1,o:any={})=>V.increaseVariable.call(scope,k,v,{...o,outscope:type});
    scope['dec'+label+'Var']=(k:any,v=1,o:any={})=>V.decreaseVariable.call(scope,k,v,{...o,outscope:type});
    scope['del'+label+'Var']=(k:any,o:any={})=>V.removeVariable.call(scope,k,{...o,scope:type});
    scope['insert'+label+'Var']=(k:any,v:any,i:any=undefined,o:any={})=>V.insertVariable.call(scope,k,v,i,{...o,scope:type});
  }
  scope.findVariables=(key:string,id=chat.length)=>V.findPreviousMessageVariables(id,key);
  scope.evalTemplate=(value:string)=>render(value,'嵌套模板');
  scope.getWorldInfo=scope.getwi;scope.include=scope.getwi;scope.getVar=scope.getvar;scope.setVar=scope.setvar;
  Object.defineProperty(scope,'variables',{get:()=>V.STATE.cacheVars});
}
async function render(text:string,name:string){
  let value=(globalThis as any).__meowMacros(String(text).replace(/\{\{\/\/[\s\S]*?\}\}/g,''));
  if(!ENV.compat.ejs || !value.includes('<%'))return value;
  try{const fn=ejs.compile(value,{async:true,client:true,compileDebug:true,filename:name});return String(await fn.call(scope,scope,ejs.escapeXML,(title:string)=>scope.getwi(title)));}
  catch(e:any){throw Error(`提示词模板「${name}」：${e.message}`);}
}
function regexOutput(value:string,prompt=false,depth=0){
  let result=value;
  for(const rule of ENV.profile.regexes || []){
    if(rule.disabled || (prompt?rule.markdownOnly:rule.promptOnly) || (Array.isArray(rule.placement)&&!rule.placement.includes(2)))continue;
    if(typeof rule.minDepth==='number'&&depth<rule.minDepth)continue;if(typeof rule.maxDepth==='number'&&depth>rule.maxDepth)continue;
    try{const m=String(rule.findRegex || '').match(/^\/([\s\S]*)\/([a-z]*)$/);const re=m?new RegExp(m[1],m[2]):new RegExp(rule.findRegex,'g');result=result.replace(re,String(rule.replaceString ?? ''));}
    catch(e:any){ENV.warnings.push(`显示正则「${rule.scriptName || rule.id}」：${e.message}`);}
  }return result;
}
function finish(extra:any={}){
  return {...extra,current,errors:ENV.errors,warnings:ENV.warnings,
    globalVariables:extension_settings.variables.global,localVariables:chat_metadata.variables,
    characterVariables:ENV.characterVariables || {},injectedPrompts:ENV.injectedPrompts || [],
    messageVariables:chat.at(-1)?.variables?.[0] || {},schemaRegistered:(listeners.get('mag_command_parsed_for_zod') || []).length>0};
}
async function initialize(){
  if(ENV.compat.mvu){
    const loaded=await loadInitVarData(current,ENV.books.map((b:any)=>b.name));
    if(loaded || !current.schema){const raw=clone(current.stat_data);current.schema=generateSchema(raw,current.schema);cleanUpMetadata(current.stat_data);await (globalThis as any).__meowEmit(variable_events.VARIABLE_INITIALIZED,current,0);}
  }
}
export async function execute(seed:any){
  install(seed);entryDepth=0;await runScripts();await initialize();setupTemplate(seed.phase);
  if(seed.phase==='prepare'){
    await (globalThis as any).__meowEmit((globalThis as any).tavern_events.GENERATION_AFTER_COMMANDS);
    const profile={...seed.profile},books=clone(seed.books),promptStates=clone(seed.promptStates || {});
    for(const key of ['description','personality','scenario','persona','examples','worldBefore','worldAfter'])profile[key]=await render(profile[key]||'',key);
    for(const book of books)for(const entry of selectEntries(book.entries,chat,{mvu:ENV.compat.mvu,warnings:ENV.warnings}))entry.content=await render(entry.content,`${book.name} / ${entry.name}`);
    for(const row of seed.prompts || [])if(row.enabled)promptStates[row.id]={...(promptStates[row.id]||{}),content:await render(promptStates[row.id]?.content ?? row.content,row.name)};
    const bindings:any[]=[];
    for(const key of ['description','personality','scenario','persona','examples','worldBefore','worldAfter'])bindings.push({get:()=>profile[key]||'',set:(value:string)=>profile[key]=value});
    for(const book of books)for(const entry of book.entries)bindings.push({get:()=>entry.content,set:(value:string)=>entry.content=value});
    for(const row of Object.values(promptStates) as any[])if(typeof row.content==='string')bindings.push({get:()=>row.content,set:(value:string)=>row.content=value});
    const payload={messages:bindings.map(binding=>({role:'system',content:binding.get()}))};
    await (globalThis as any).__meowEmit((globalThis as any).tavern_events.CHAT_COMPLETION_SETTINGS_READY,payload);
    bindings.forEach((binding,index)=>binding.set(payload.messages[index]?.content ?? binding.get()));
    const history=Object.fromEntries(chat.filter(m=>m.id).map((m:any,i:number)=>[m.id,m.is_user?m.mes:regexOutput(m.mes,true,chat.length-i-1)]));
    return finish({profile,books,promptStates,history});
  }
  const before=clone(current);
  const rendered=await render(seed.content || '','模型回复');
  if(V.STATE.cacheVars.stat_data)current.stat_data=clone(V.STATE.cacheVars.stat_data);
  const commands=ENV.compat.mvu?extractCommands(rendered):[];
  if(ENV.compat.mvu)await updateVariables(rendered,current,ENV.errors);
  const updateContext={variables:current,message_content:rendered};
  if(ENV.compat.mvu)await (globalThis as any).__meowEmit(variable_events.BEFORE_MESSAGE_UPDATE,updateContext);
  current=updateContext.variables;
  let visible=updateContext.message_content.replace(/<(?:UpdateVariable|VariableUpdate|update)\b[^>]*>[\s\S]*?<\/(?:UpdateVariable|VariableUpdate|update)>/gi,'');
  if(ENV.compat.mvu&&!/<StatusPlaceHolderImpl\s*\/>/i.test(visible))visible+='\n<StatusPlaceHolderImpl/>';
  V.STATE.cacheVars.stat_data=clone(current.stat_data);V.STATE.isDryRun=true;
  const display=await render(regexOutput(visible),'角色卡显示模板');
  const hasBlock=/<(?:UpdateVariable|VariableUpdate|update)\b/i.test(rendered)||commands.length>0,emptyPatch=/<JSONPatch>\s*\[\s*\]\s*<\/JSONPatch>/i.test(rendered);
  const mvuUpdate=ENV.compat.mvu?{status:ENV.errors.length?'error':!hasBlock?'missing':!commands.length&&!emptyPatch?'invalid':_.isEqual(before.stat_data,current.stat_data)?'unchanged':'updated',commands:commands.length}:null;
  return finish({before,renderedContent:updateContext.message_content,displayContent:display,mvuUpdate,commands:commands.map(c=>({type:c.type,path:c.args[0]}))});
}
