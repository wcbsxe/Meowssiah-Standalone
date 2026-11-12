'use strict';
const {randomUUID} = require('node:crypto');
const zlib = require('node:zlib');
const preset = require('../data/preset.json');
const Original=require('./original-runtime.cjs');
const L=require('./library.cjs');
const Runtime=require('./card-runtime.cjs');
const Worldbook=require('./worldbook.cjs'),vm=require('node:vm');
const keywordRegex=new vm.Script('new RegExp(pattern,flags).test(value)');
const text = (v, max=200000) => String(v ?? '').slice(0,max);
const number = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.max(min,Math.min(max,Number(v))) : fallback;
const own = (o,k) => Object.prototype.hasOwnProperty.call(o || {},k);

function profile(input={}) {
  const p = {};
  for (const k of ['name','userName','description','personality','scenario','persona','firstMessage','examples','worldBefore','worldAfter']) p[k]=text(input[k]);
  p.name ||= '小猫之神'; p.userName ||= '旅人';
  p.worldbook = normalizeWorldbook(input.worldbook || []);
  p.regexes=Array.isArray(input.regexes)?JSON.parse(JSON.stringify(input.regexes)).slice(0,100):[];
  p.helperScripts=Runtime.flattenScripts(input.helperScripts || []);
  const material=JSON.stringify([p.worldbook,p.helperScripts,p.regexes,p.firstMessage]);
  p.compat={mvu:typeof input.compat?.mvu==='boolean'?input.compat.mvu:/\[initvar\]|UpdateVariable|MagVarUpdate|\bMvu\b|mvu_zod/i.test(material),
    ejs:typeof input.compat?.ejs==='boolean'?input.compat.ejs:material.includes('<%'),cardHtml:input.compat?.cardHtml!==false};
  if(input.rawCard && typeof input.rawCard==='object')p.rawCard=JSON.parse(JSON.stringify(input.rawCard));
  return p;
}
function newSession(input={}) {
  return {id:randomUUID(),title:'未命名的故事',createdAt:Date.now(),updatedAt:Date.now(),
    profile:profile(input),messages:[],mode:'theater',chatAutoReturn:true,deepThink:false,note:'',noteAutoClear:true};
}
function defaultState() {
  const s=newSession();
  const state={schemaVersion:1,revision:0,activeId:s.id,sessions:[s],promptStates:{},ui:{theme:'light'},
    settings:{baseUrl:'',model:'',temperature:preset.parameters.temperature,topP:preset.parameters.top_p,
      maxTokens:Original.source.openai_max_tokens,contextChars:2000000,timeoutSeconds:180,sendReasoning:false,reasoningEffort:'low',requestMode:'original',toolChoice:'required',signatureMode:'original'}};
  state.library=L.normalizeLibrary(null,state.sessions,profile,normalizeWorldbook);return state;
}
function normalizeSettings(cfg={}) {
  return {baseUrl:text(cfg.baseUrl,2000).trim(),model:text(cfg.model,300).trim(),
    temperature:number(cfg.temperature,1.09,0,2),topP:number(cfg.topP,.98,.01,1),maxTokens:Math.round(number(cfg.maxTokens,Original.source.openai_max_tokens,64,65536)),
    contextChars:Math.round(number(cfg.contextChars,2000000,4000,10000000)),timeoutSeconds:number(cfg.timeoutSeconds,180,5,600),
    sendReasoning:!!cfg.sendReasoning,reasoningEffort:['low','medium','high'].includes(cfg.reasoningEffort)?cfg.reasoningEffort:'low',
    availableModels:Array.isArray(cfg.availableModels)?[...new Set(cfg.availableModels.map(m=>text(m,300)).filter(Boolean))].slice(0,2000):[],
    requestMode:'original',toolChoice:'required',signatureMode:'original'};
}
function normalizeWorldbook(input) {
  const entries=Array.isArray(input) ? input : Object.values(input?.entries || {});
  return entries.slice(0,1000).map((e,i)=>({...JSON.parse(JSON.stringify(e)),id:text(e.id ?? e.uid ?? i,100),name:text(e.name || e.comment || `资料 ${i+1}`,300),
    content:text(e.content),keys:(Array.isArray(e.keys || e.key) ? e.keys || e.key : [e.keys || e.key || '']).map(k=>text(k,200)).filter(Boolean),
    secondary:(Array.isArray(e.secondary || e.secondary_keys || e.keysecondary) ? e.secondary || e.secondary_keys || e.keysecondary : []).map(k=>text(k,200)).filter(Boolean),
    selective:!!e.selective,constant:!!e.constant,enabled:e.enabled!==false && e.disable!==true,
    position:(e.position===1 || e.position==='after_char' || e.position==='after') ? 'after' : 'before',order:number(e.order ?? e.insertion_order,100,-10000,10000),
    originalPosition:number(e.originalPosition ?? e.extensions?.position ?? (typeof e.position==='number'?e.position:e.position==='after'?1:0),0,0,7),depth:number(e.depth ?? e.extensions?.depth,4,0,100),role:number(e.role ?? e.extensions?.role,0,0,2),
    caseSensitive:!!(e.case_sensitive || e.caseSensitive),regex:!!(e.use_regex || e.regex)}));
}
function normalizeState(input) {
  if (!input || typeof input!=='object' || input.schemaVersion!==1 || !Array.isArray(input.sessions)) throw new Error('这不是本程序的备份文件（需要 schemaVersion: 1）。');
  if (input.sessions.length>200) throw new Error('一次最多保留 200 个故事。请分批导入。');
  const output=defaultState(), cfg=input.settings || {};
  output.settings=normalizeSettings(cfg);
  output.ui={theme:input.ui?.theme==='dark'?'dark':'light'};
  output.promptStates={};
  for (const p of preset.prompts) {
    const v=input.promptStates?.[p.id];
    if (v && typeof v==='object') output.promptStates[p.id]={enabled:typeof v.enabled==='boolean'?v.enabled:p.enabled,
      ...(typeof v.content==='string' && !p.archivedConfig ? {content:text(v.content)} : {})};
  }
  const ids=new Set();
  output.sessions=input.sessions.map(s=>{
    const n=newSession(s.profile), id=text(s.id,100);
    n.id=id&&!ids.has(id)?id:randomUUID();ids.add(n.id);
    n.title=text(s.title,100)||'未命名的故事';n.createdAt=number(s.createdAt,Date.now(),0,1e15);n.updatedAt=number(s.updatedAt,Date.now(),0,1e15);
    n.mode=s.mode==='chat'?'chat':'theater';n.deepThink=!!s.deepThink;n.note=text(s.note,10000);n.noteAutoClear=s.noteAutoClear!==false;
    n.chatAutoReturn=s.chatAutoReturn!==false;
    n.characterId=text(s.characterId,120);
    if(s.detachedCharacter && typeof s.detachedCharacter==='object' && !Array.isArray(s.detachedCharacter))n.detachedCharacter=JSON.parse(JSON.stringify(s.detachedCharacter));
    if(s.runtime && typeof s.runtime==='object')n.runtime=JSON.parse(JSON.stringify(s.runtime));
    if(s.hostMetadata && typeof s.hostMetadata==='object'){
      const raw=JSON.stringify(s.hostMetadata);if(raw.length>5000000)throw new Error('单个故事的原版账本超过 5MB。');n.hostMetadata=JSON.parse(raw);
    }
    if ((s.messages || []).length>20000) throw new Error('单个故事的消息数量超过 20000 条。');
    n.messages=(s.messages || []).filter(m=>m && ['user','assistant'].includes(m.role)).map(m=>({id:text(m.id,100)||randomUUID(),role:m.role,
      content:text(m.content,1000000),timestamp:number(m.timestamp,Date.now(),0,1e15),mode:m.mode==='chat'?'chat':'theater',
      status:['complete','stopped','error'].includes(m.status)?m.status:'complete',usage:sanitizeUsage(m.usage),
      ...(m.extra && typeof m.extra==='object'?{extra:JSON.parse(JSON.stringify(m.extra))}:{}),
      ...(m.turnContext&&typeof m.turnContext==='object'?{turnContext:{userMessageId:text(m.turnContext.userMessageId,100),directorNote:text(m.turnContext.directorNote),deepThink:!!m.turnContext.deepThink,mode:m.turnContext.mode==='chat'?'chat':'theater'}}:{}),
      ...(m.runtime && typeof m.runtime==='object'?{runtime:JSON.parse(JSON.stringify(m.runtime))}:{}),
      ...(m.variables && typeof m.variables==='object'?{variables:JSON.parse(JSON.stringify(m.variables))}:{}),
      ...(typeof m.renderedContent==='string'?{renderedContent:text(m.renderedContent,2000000)}:{}),
      ...(typeof m.displayContent==='string'?{displayContent:text(m.displayContent,2000000)}:{}),
      ...(m.providerCall?.function?.name==='soliumbra_reply' ? {providerCall:{content:text(m.providerCall.content,1000000),
        function:{name:'soliumbra_reply',arguments:text(m.providerCall.function.arguments,2000000)},signature:text(m.providerCall.signature,500000)}} : {})}));
    return n;
  });
  if(!output.sessions.length) output.sessions=[newSession()];
  output.activeId=output.sessions.some(s=>s.id===input.activeId)?input.activeId:output.sessions[0].id;
  output.revision=number(input.revision,0,0,1e12);
  output.library=L.normalizeLibrary(input.library,output.sessions,profile,normalizeWorldbook);
  return output;
}
function sanitizeUsage(v) {
  if(!v || typeof v!=='object') return null;
  return Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].filter(k=>Number.isFinite(v[k])).map(k=>[k,v[k]]));
}
function effectivePrompts(state) {
  return preset.prompts.map(p=>({...p,...state.promptStates?.[p.id]}));
}
function expandMacros(raw,p,lastUser,warnings) {
  let value=text(raw,1000000).replace(/\{\{\/\/[\s\S]*?\}\}/g,'').replace(/\{\{trim\}\}/gi,'');
  const map={user:p.userName,char:p.name,description:p.description,personality:p.personality,scenario:p.scenario,persona:p.persona,lastusermessage:lastUser};
  value=value.replace(/\{\{([a-zA-Z]+)\}\}/g,(all,k)=>own(map,k.toLowerCase())?map[k.toLowerCase()]:all);
  const unknown=value.match(/\{\{[^{}]+\}\}/g);
  if(unknown) warnings.push(`有尚未解析的酒馆宏：${[...new Set(unknown)].slice(0,5).join('、')}。已按原文保留。`);
  return value.replace(/<<<\|\s*catgodml\s*\|[\s\S]*?>>>/gi,'').trim();
}
function stripAuxiliary(raw) {
  return String(raw).replace(/<(think_nya|report_nya|think|thinking)~?\b[^>]*>[\s\S]*?<\/\1~?>/gi,'').trim();
}
function selectWorldbook(entries,messages,options={}) {
  const deadline=Date.now()+2000;
  return Worldbook.selectEntries(entries,messages,{...options,testRegex:({source,flags},value)=>{
    if(Date.now()>deadline)throw Error('本轮关键词正则匹配超过时间预算');
    return keywordRegex.runInNewContext({pattern:source,flags,value},{timeout:25,contextCodeGeneration:{strings:false,wasm:false}});
  }});
}
function compileOriginal(state,session,prepared=null){
  const p=profile(prepared?.profile || L.resolveProfile(state,session)), warnings=[...(prepared?.warnings || [])], lastUser=session.messages.findLast(m=>m.role==='user')?.content || '';
  if(prepared?.books)p.worldbook=prepared.books.flatMap(b=>b.entries.map(e=>({...e,sourceBook:b.name,sourceBookId:b.id})));
  const effective=effectivePrompts(state),byId=new Map(effective.map(p=>[p.id,p]));
  const settings=JSON.parse(JSON.stringify(Original.source));
  for(const row of settings.prompts){const value=byId.get(row.identifier);if(value && !value.archivedConfig){row.content=prepared?.promptStates?.[value.id]?.content ?? value.content;row.enabled=value.enabled;}}
  const order=settings.prompt_order.find(o=>o.character_id===100001).order;
  for(const row of order){const value=byId.get(row.identifier);if(value)row.enabled=value.enabled;}
  settings.extensions.SPreset.LogUpload={enabled:false,url:''};
  const active=selectWorldbook(p.worldbook,session.messages,{mvu:p.compat.mvu,warnings});
  const slots={personaDescription:p.persona,charDescription:p.description,charPersonality:p.personality,scenario:p.scenario,dialogueExamples:p.examples,
    worldInfoBefore:[p.worldBefore,...active.filter(e=>e.originalPosition===0).map(e=>e.content)].filter(Boolean).join('\n\n'),
    worldInfoAfter:[p.worldAfter,...active.filter(e=>e.originalPosition===1).map(e=>e.content)].filter(Boolean).join('\n\n')};
  const messages=[];
  const cleanHistory=session.messages.filter(m=>m.status!=='error' && m.content.trim());
  for(const item of order){
    if(!item.enabled)continue;const row=settings.prompts.find(p=>p.identifier===item.identifier);if(!row)continue;
    if(row.identifier==='chatHistory'){
      for(const m of cleanHistory){const body=prepared?.history?.[m.id] ?? m.renderedContent ?? m.content;messages.push({role:m.role,content:m.role==='assistant'?stripAuxiliary(body):body});}
    }else{
      const content=expandMacros(row.marker?(slots[row.identifier] || ''):row.content,p,lastUser,warnings);
      // Unlike the native draft, preserve all catgodml markers until the original processor consumes them.
      const raw=String(row.marker?(slots[row.identifier] || ''):row.content || '').replace(/\{\{\/\/[\s\S]*?\}\}/g,'').replace(/\{\{trim\}\}/gi,'')
        .replace(/\{\{([a-zA-Z]+)\}\}/g,(all,k)=>({user:p.userName,char:p.name,description:p.description,personality:p.personality,scenario:p.scenario,persona:p.persona,lastusermessage:lastUser})[k.toLowerCase()] ?? all).trim();
      void content;if(raw)messages.push({role:row.role || 'system',content:raw});
    }
  }
  const worldEntries=active.map(e=>({uid:e.id,world:e.sourceBook || '独立工作台',comment:e.name,content:expandMacros(e.content,p,lastUser,warnings),constant:e.constant,
    position:e.originalPosition,depth:e.depth,role:e.role}));
  for(const entry of prepared?.injectedPrompts || [])if(typeof entry.content==='string')worldEntries.push({uid:'script-'+entry.id,world:'卡片脚本',comment:String(entry.id || '脚本注入'),content:entry.content,constant:true,position:4,depth:Number(entry.depth)||0,role:entry.role==='user'?1:entry.role==='assistant'?2:0});
  if(p.compat.mvu){
    const current=prepared?.current || Runtime.snapshot(session).current;
    const snapshot=current?.stat_data?`\n<mvu_current_snapshot>${JSON.stringify(current.stat_data)}</mvu_current_snapshot>`:'';
    worldEntries.push({uid:'standalone-mvu-contract',world:'独立工作台',comment:'MVU 随本轮回复更新 · 当前权威快照',content:Worldbook.mvuContract()+snapshot,constant:true,position:4,depth:0,role:0});
  }
  if(p.worldBefore)worldEntries.push({uid:'manual-before',comment:'前置世界资料',content:p.worldBefore,constant:true,position:0,depth:4,role:0});
  if(p.worldAfter)worldEntries.push({uid:'manual-after',comment:'后置世界资料',content:p.worldAfter,constant:true,position:1,depth:4,role:0});
  const chat=cleanHistory.map(m=>({mes:m.content,is_user:m.role==='user',is_system:false,name:m.role==='user'?p.userName:p.name,extra:m.extra || {}}));
  const request={model:state.settings.model,messages,tools:[Original.replyTool()],stream:true,
    temperature:state.settings.temperature,top_p:state.settings.topP,max_tokens:state.settings.maxTokens};
  if(state.settings.sendReasoning)request.reasoning_effort=state.settings.reasoningEffort;
  const result=Original.originalRewrite({request,settings,chat,metadata:session.hostMetadata || {},
    oracle:{mode:session.mode,deepThink:session.deepThink,note:{text:session.note || '',autoClear:session.noteAutoClear}},worldEntries,chatId:session.id});
  const chars=JSON.stringify(result.request).length;
  if(chars>state.settings.contextChars)throw new Error(`原流程重写后共 ${chars} 字符，超过设置的 ${state.settings.contextChars} 字符上限。请调高上限；程序没有另行裁剪原流程的历史。`);
  return {request:result.request,hostMetadata:result.metadata,extras:result.extras,diagnostics:{compiler:'original-spreset-v1',characters:chars,
    enabledPreferences:order.filter(x=>x.enabled).length,retainedMessages:cleanHistory.length,activeWorldbook:active.map(e=>e.name),
    warnings:[...new Set(warnings)],sourceScriptSHA256:Original.hashes.FinalRequestProcessing,
    selectedWorldbooks:L.selectedBooks(state,session).map(b=>b.name),matchedWorldbookRegexEntries:active.filter(e=>e.regex).map(e=>e.name),runtime:{mvu:p.compat.mvu,ejs:p.compat.ejs,schemaRegistered:!!prepared?.schemaRegistered,mvuUpdateMode:p.compat.mvu?'same-response':'off'},
    signatures:JSON.stringify(result.request).split('skip_thought_signature_validator').length-1}};
}
function parseReply(raw) {
  const value=stripAuxiliary(raw), parts={story:'',summary:'',comment:'',background:'',options:[]};
  for(const key of ['summary','comment','background']) {
    const re=new RegExp(`<${key}\\b[^>]*>([\\s\\S]*?)<\\/${key}>`,'gi');
    parts[key]=[...value.matchAll(re)].map(m=>m[1].trim()).join('\n\n');
  }
  for(const m of value.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)) if(m[1].trim()) parts.options.push(m[1].trim());
  const games=[...value.matchAll(/<game\b[^>]*>([\s\S]*?)<\/game>/gi)];
  parts.story=games.length?games.map(m=>m[1].trim()).join('\n\n'):value
    .replace(/<(summary|comment|background|options)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<\/?game\b[^>]*>/gi,'').trim();
  return parts;
}
function formatToolCalls(calls) {
  const pieces=[];
  for(const call of calls) {
    if(!['soliumbra_reply','reply'].includes(call.function?.name || call.name)) continue;
    let args=call.function?.arguments ?? call.arguments;
    try{if(typeof args==='string') args=JSON.parse(args);}catch{continue;}
    if(!args || typeof args!=='object') continue;
    for(const key of ['game_content','game','story_body','content','extra','options','summary','comment','background']) {
      if(typeof args[key]!=='string' || !args[key].trim()) continue;
      const val=args[key].trim(),tag={game_content:'game',game:'game',options:'options',summary:'summary',comment:'comment',background:'background'}[key];
      pieces.push(tag&&!new RegExp(`<${tag}\\b`,'i').test(val)?`<${tag}>\n${val}\n</${tag}>`:val);
    }
  }
  return pieces.join('\n');
}
function importCharacter(input) {
  const d=input?.data || input;
  if(!d || typeof d!=='object' || !(d.name || d.description || d.first_mes)) throw new Error('没有找到角色名称或角色描述，请选择角色卡 JSON 或 PNG。');
  return profile({name:d.name,description:d.description,personality:d.personality,scenario:d.scenario,firstMessage:d.first_mes,
    examples:d.mes_example,worldbook:d.character_book?.entries || [],userName:'旅人',regexes:d.extensions?.regex_scripts || [],
    helperScripts:d.extensions?.tavern_helper?.scripts || [],rawCard:input});
}
function characterFromPng(buffer) {
  if(buffer.length>20*1024*1024 || buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a') throw new Error('角色 PNG 格式不正确或超过 20MB。');
  let pos=8,candidates=[];
  while(pos+12<=buffer.length) {
    const len=buffer.readUInt32BE(pos),end=pos+12+len;
    if(end>buffer.length) throw new Error('PNG 数据块不完整。');
    const type=buffer.toString('ascii',pos+4,pos+8),chunk=buffer.subarray(pos+8,pos+8+len);
    if(type==='tEXt' || type==='zTXt') {
      const zero=chunk.indexOf(0),key=chunk.subarray(0,zero).toString();
      if(['chara','ccv3'].includes(key)) {
        let data=chunk.subarray(zero+1);
        if(type==='zTXt') data=zlib.inflateSync(data.subarray(1),{maxOutputLength:5*1024*1024});
        const parsed=JSON.parse(Buffer.from(data.toString(),'base64').toString('utf8'));
        candidates.push({key,data:parsed});
      }
    }
    pos=end;if(type==='IEND') break;
  }
  const found=candidates.find(x=>x.key==='ccv3') || candidates[0];
  if(!found) throw new Error('这张 PNG 没有角色卡数据，请导入从酒馆导出的角色卡 PNG 或 JSON。');
  return importCharacter(found.data);
}
module.exports={preset,profile,newSession,defaultState,normalizeState,normalizeSettings,effectivePrompts,compile:compileOriginal,parseReply,formatToolCalls,stripAuxiliary,
  normalizeWorldbook,importCharacter,characterFromPng,sanitizeUsage};
