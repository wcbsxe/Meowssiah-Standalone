'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let state,preset,keyConfigured=false,dataDir='',busy=false,jobId='',liveText='',liveMessageId='',saveTimer,toastTimer;
let saveChain=Promise.resolve(),lastDiagnostics=null,modalContext='';
const session=()=>state.sessions.find(s=>s.id===state.activeId);
const element=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
const uid=()=>crypto.randomUUID();
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800);}
function showError(message){$('#error-banner').textContent=message;$('#error-banner').hidden=false;}
async function api(path,body){
  const r=await fetch('/api/'+path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  let j;try{j=await r.json();}catch{throw Error('本机服务没有返回有效数据。请重新打开程序。');}if(!r.ok)throw Error(j.error || '本机请求出错。');return j;
}
function persist(immediate=false){
  clearTimeout(saveTimer);$('#save-status').textContent='保存中…';
  const write=()=>{
    const snapshot=structuredClone(state);
    saveChain=saveChain.catch(()=>{}).then(async()=>{if(busy)return;const result=await api('state',{state:snapshot});state.revision=result.state.revision;$('#save-status').textContent='已保存在本机';}).catch(e=>{showError('保存出错：'+e.message);$('#save-status').textContent='保存失败';throw e;});
    return saveChain;
  };
  if(immediate)return write();saveTimer=setTimeout(()=>write().catch(()=>{}),350);
}
function openModal(title,context=''){$('#modal-title').textContent=title;$('#modal-body').replaceChildren();$('#modal').showModal();modalContext=context;return $('#modal-body');}
function closeModal(){$('#modal').close();modalContext='';}
function button(text,fn,cls='outline'){const e=element('button',cls,text);e.type='button';e.addEventListener('click',fn);return e;}
function notice(text){return element('div','notice',text);}
function field(label,value,type='text',full=false,help=''){
  const wrap=element('label','field'+(full?' full':'')),name=element('span','',label),input=element(type==='textarea'?'textarea':'input');
  if(type!=='textarea')input.type=type;input.value=value ?? '';wrap.append(name,input);if(help)wrap.append(element('small','',help));return {wrap,input};
}
function selectField(label,value,options,help=''){
  const wrap=element('label','field'),input=element('select');wrap.append(element('span','',label),input);
  for(const [v,t] of options){const o=element('option','',t);o.value=v;input.append(o);}input.value=value;if(help)wrap.append(element('small','',help));return {wrap,input};
}
function check(label,value){const wrap=element('label','check-inline'),input=element('input');input.type='checkbox';input.checked=!!value;wrap.append(input,document.createTextNode(label));return {wrap,input};}
function actions(...children){const e=element('div','form-actions');e.append(...children);return e;}
function render(){
  document.body.dataset.theme=state.ui.theme;
  updateLibraryBadges();
  const s=session();$('#rename-story').textContent=s.title;$('#workspace-heading').textContent=s.messages.length?'让故事，继续发生。':'给想象，一个栖身之处。';
  $('#mode-badge').textContent=s.mode==='chat'?'场外聊天':'剧场模式';
  $$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===s.mode));
  $('#deep-think').checked=s.deepThink;$('#director-note').value=s.note;$('#note-auto-clear').checked=s.noteAutoClear;
  $('#chat-auto-return').checked=s.chatAutoReturn!==false;
  $('#note-indicator').textContent=s.note.trim()?'本轮生效':'';
  $('#message-input').placeholder=s.mode==='chat'?'和小猫讨论剧情、角色，或聊聊别的…':'下一幕，由你落笔…';
  $('#character-name').textContent=s.profile.name;$('#character-description').textContent=s.profile.description || '把角色和世界带进来，让每一次续写都有来处。';
  $('#message-count').textContent=s.messages.length+' 条消息';$('#composer-model').textContent=state.settings.model || '尚未配置模型';
  $('#connection-dot').classList.toggle('green',!!state.settings.baseUrl&&!!state.settings.model);
  const count=preset.prompts.filter(p=>(state.promptStates[p.id]?.enabled ?? p.enabled)).length;$('#preset-count').textContent=count+' / 53';
  renderShelf();renderMessages();
}
function renderShelf(){
  const list=$('#story-list');list.replaceChildren();$('#story-count').textContent=state.sessions.length;
  const term=$('#search-stories').value.trim().toLowerCase();
  for(const s of [...state.sessions].sort((a,b)=>b.updatedAt-a.updatedAt).filter(s=>s.title.toLowerCase().includes(term))){
    const b=element('button','story-item'+(s.id===state.activeId?' active':''));b.append(element('span','','▧'));
    const text=element('span');text.append(element('strong','',s.title),element('small','',`${new Date(s.updatedAt).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})} · ${s.messages.length} 条消息`));b.append(text);
    b.addEventListener('click',async()=>{if(busy)return;await persist(true);state.activeId=s.id;render();await persist(true);scrollBottom();});list.append(b);
  }
  if(!list.childElementCount)list.append(element('div','empty','没有找到这个故事'));
}
function inlineText(target,text){
  const regex=/(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*)/g;let pos=0;
  for(const m of text.matchAll(regex)){target.append(document.createTextNode(text.slice(pos,m.index)));target.append(element(m[2]?'strong':m[3]?'code':'em','',m[2] || m[3] || m[4]));pos=m.index+m[0].length;}target.append(document.createTextNode(text.slice(pos)));
}
function rich(raw){
  const node=element('div','rich-text');const chunks=String(raw).split(/(```[\s\S]*?```)/g);
  for(const chunk of chunks){if(chunk.startsWith('```')){node.append(element('pre','',chunk.replace(/^```[^\n]*\n?/,'').replace(/```$/,'')));continue;}
    for(const para of chunk.split(/\n\s*\n/)){if(!para.trim())continue;let e;
      if(/^#{1,4}\s/.test(para)){e=element('h3');inlineText(e,para.replace(/^#{1,4}\s/,''));}
      else if(/^>\s/.test(para)){e=element('blockquote');inlineText(e,para.replace(/^>\s/gm,''));}
      else{e=element('p');inlineText(e,para);}node.append(e);
    }
  }return node;
}
function parse(raw){
  const value=String(raw).replace(/<(think_nya|report_nya|think|thinking)~?\b[^>]*>[\s\S]*?<\/\1~?>/gi,'');
  const parts={story:'',summary:'',comment:'',background:'',thought:'',options:[]};
  parts.thought=[...String(raw).matchAll(/<(?:think_nya|report_nya)~?>([\s\S]*?)<\/(?:think_nya|report_nya)~?>/gi)].map(m=>m[1]).join('\n\n');
  for(const tag of ['summary','comment','background'])parts[tag]=[...value.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`,'gi'))].map(m=>m[1].trim()).join('\n\n');
  parts.options=[...value.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)].map(m=>m[1].trim());
  const games=[...value.matchAll(/<game\b[^>]*>([\s\S]*?)<\/game>/gi)];
  parts.story=games.length?games.map(m=>m[1].trim()).join('\n\n'):value.replace(/<(summary|comment|background|options)\b[^>]*>[\s\S]*?(?:<\/\1>|$)/gi,'').replace(/<\/?game\b[^>]*>/gi,'').trim();
  return parts;
}
function renderMessage(m,isLive=false){
  const box=element('article','message '+m.role);box.dataset.id=m.id;
  const head=element('div','message-heading'),avatar=element('span','avatar',m.role==='user'?'⌁':'✧');
  head.append(avatar,element('strong','',m.role==='user'?session().profile.userName:'小猫之神'),element('time','',new Date(m.timestamp).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})));
  if(m.mode==='chat')head.append(element('span','pill','场外'));box.append(head);
  const body=element('div','message-body');
  if(m.role==='user')body.append(rich(m.content));else{
    const display=!isLive?(m.displayContent ?? m.renderedContent ?? m.content):m.content;
    const split=!isLive && session().profile.compat?.cardHtml!==false?splitCardDisplay(display):{text:display,blocks:[]};
    const p=parse(split.text);body.append(rich(p.story || (isLive?'小猫正在整理回复…':'')));
    const labels={summary:'场记 · 本轮摘要',comment:'猫猫悄悄话',background:'背景中的故事',thought:'模型附带的思考文本'};
    for(const [key,label] of Object.entries(labels)){if(!p[key])continue;const d=element('details','message-extra');d.append(element('summary','',label),rich(p[key]));body.append(d);}
    if(p.options.length&&!isLive){const options=element('div','message-options');for(const option of p.options)options.append(button(option,()=>{$('#message-input').value=option;$('#message-input').focus();},'option-button'));body.append(options);}
    for(const html of split.blocks)body.append(cardFrame(html,m));
    if(!isLive && m.runtime?.after?.stat_data && Object.keys(m.runtime.after.stat_data).length){const d=element('details','message-extra');d.append(element('summary','','本条消息的变量快照'),element('pre','code-view',JSON.stringify(m.runtime.after.stat_data,null,2)));body.append(d);}
    if(m.runtime?.errors?.length)body.append(element('div','notice','本轮变量更新提示：'+m.runtime.errors.join('\n')));
  }
  box.append(body);
  if(!isLive){const tools=element('div','message-actions');tools.append(button('复制',()=>navigator.clipboard.writeText(m.content).then(()=>toast('已复制原文')),'text-button'));
    tools.append(button('编辑',()=>editMessage(m),'text-button'));
    if(m.status!=='complete')tools.append(element('span','',m.status==='stopped'?'已停止 · 保留收到的内容':'响应出错 · 保留收到的内容'));
    if(m.usage?.total_tokens)tools.append(element('span','',m.usage.total_tokens+' tokens（接口返回）'));box.append(tools);
  }return box;
}
function renderMessages(){
  const s=session(),list=$('#messages');list.replaceChildren();$('#welcome').hidden=s.messages.length>0||busy;
  for(const m of s.messages)list.append(renderMessage(m));
  if(busy && liveMessageId)list.append(renderMessage({id:liveMessageId,role:'assistant',content:liveText,timestamp:Date.now(),mode:s.mode},true));
  $('#retry-message').hidden=!s.messages.some(m=>m.role==='user')||busy;
  const latest=[...s.messages].reverse().find(m=>m.role==='assistant'&&parse(m.content).summary);
  $('#latest-summary').textContent=latest?parse(latest.content).summary:'故事开始后，模型返回的场记会留在这里，方便接着写。';
}
function scrollBottom(){const e=$('#chat-scroll');e.scrollTop=e.scrollHeight;}
function blankProfile(){return {name:'小猫之神',userName:'旅人',description:'',personality:'',scenario:'',persona:'',firstMessage:'',examples:'',worldBefore:'',worldAfter:'',worldbook:[]};}
function newStory(p=null,characterId=null){
  if(busy)return;
  let card=characterId?state.library.characters.find(c=>c.id===characterId):null;
  if(!p&&!card)card=currentCard();if(!card)card=registerProfile(p || blankProfile());p=card.profile;
  const s={id:uid(),characterId:card.id,title:'未命名的故事',createdAt:Date.now(),updatedAt:Date.now(),profile:structuredClone(p),messages:[],mode:'theater',chatAutoReturn:true,deepThink:false,note:'',noteAutoClear:true};
  state.sessions.push(s);state.activeId=s.id;render();persist();$('#message-input').value='';$('#message-input').focus();
}
function setBusy(value){busy=value;document.body.classList.toggle('busy',value);$('#send-message').hidden=value;$('#stop-generation').hidden=!value;$('#message-input').disabled=value;$('#generation-status').hidden=!value;
  for(const id of ['deep-think','director-note','note-auto-clear','chat-auto-return','rename-story','new-story','theme-toggle'])$('#'+id).disabled=value;}
async function send(retry=false){
  if(busy)return;
  if(!state.settings.baseUrl||!state.settings.model){openConnection();toast('先填模型连接，再开始生成。');return;}
  const input=$('#message-input'),value=input.value.trim(),s=session();
  if(!retry&&!value)return;
  await persist(true).catch(()=>{});await saveChain.catch(()=>{});
  const temporaryChatReplay=retry&&s.mode==='theater'&&s.messages.at(-1)?.role==='assistant'&&s.messages.at(-1)?.mode==='chat';
  if(temporaryChatReplay)s.mode='chat';
  if(retry){const last=s.messages.findLastIndex(m=>m.role==='user');if(last<0)return;const old=s.messages[last+1];if(old?.runtime?.beforeGlobals)state.library.globalVariables=structuredClone(old.runtime.beforeGlobals);s.messages.splice(last+1);}
  else{s.messages.push({id:uid(),role:'user',content:value,timestamp:Date.now(),mode:s.mode,status:'complete',extra:{}});input.value='';}
  s.updatedAt=Date.now();liveText='';liveMessageId=uid();jobId='';setBusy(true);$('#generation-status').textContent='正在按原预设重写请求并连接模型…';$('#error-banner').hidden=true;renderMessages();scrollBottom();
  try {
    const res=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state,temporaryChatReplay})});
    if(!res.ok){const j=await res.json();throw Error(j.error || '生成请求出错。');}
    const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',receivedDone=false,renderAt=0;
    function handle(data){const e=JSON.parse(data);switch(e.type){
      case 'start':jobId=e.jobId;liveMessageId=e.messageId;lastDiagnostics=e.diagnostics;$('#generation-status').textContent=`原版请求已生成 · ${e.diagnostics.characters.toLocaleString()} 字符 · 等待模型回复…`;break;
      case 'delta':liveText+=e.text;break;
      case 'replace':liveText=e.text;break;
      case 'warning':toast(e.text);break;
      case 'error':if(!e.stopped)showError(e.error);else toast('生成已停止，已收到的内容留在故事里。');break;
      case 'done':state=e.state;receivedDone=true;break;
    }
    if((e.type==='delta'||e.type==='replace')&&Date.now()-renderAt>90){const near=$('#chat-scroll').scrollHeight-$('#chat-scroll').scrollTop-$('#chat-scroll').clientHeight<140;renderMessages();if(near)scrollBottom();renderAt=Date.now();$('#generation-status').textContent='小猫正在写下一幕…';}}
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let n;
      while((n=buffer.indexOf('\n\n'))!==-1){const event=buffer.slice(0,n);buffer=buffer.slice(n+2);const data=event.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data)handle(data);}}
    if(!receivedDone){const boot=await api('bootstrap');state=boot.state;throw Error('本机连接中断。已重新载入存档，请检查最后一条回复。');}
  }catch(e){showError(e.message);}
  finally{if(temporaryChatReplay)session().mode='theater';setBusy(false);liveText='';liveMessageId='';jobId='';render();persist();scrollBottom();$('#message-input').focus();}
}
function openConnection(){
  const body=openModal('模型连接','connection');body.append(notice('使用兼容 Chat Completions 的接口。请求会先经过原版 SPreset 处理，保留 context、soliumbra_reply、toolConfig 与原签名字段。接口需接受这些字段；这里不静默改写或降级。'));
    const grid=element('div','form-grid'),cfg=state.settings;
  const base=field('接口地址',cfg.baseUrl,'url',true,'例如 https://服务地址/v1；本机模型可填 http://127.0.0.1:端口/v1。'),key=field('API 密钥（只留在本次运行的内存中）','','password',true,keyConfigured?'本次运行已填写密钥。留空则保持现有密钥；关闭程序后清除。':'没有密钥的本机接口可留空。密钥不写入存档、备份或请求预览。'),model=field('模型名',cfg.model,'text',true,'填写接口实际提供的模型 ID。');
  model.input.setAttribute('list','model-list');const dl=element('datalist');dl.id='model-list';model.wrap.append(dl);
  const max=field('最大输出 tokens',cfg.maxTokens,'number',false,'接口计量单位，不等于字数。以模型上限为准。'),context=field('请求字符上限',cfg.contextChars,'number',false,'仅做发送前检查；不另行截断原流程的历史。'),temp=field('Temperature',cfg.temperature,'number',false,'采样随机性，源预设为 1.09。'),top=field('Top P',cfg.topP,'number'),timeout=field('请求超时 / 秒',cfg.timeoutSeconds,'number');
  temp.input.step='.01';top.input.step='.01';
  const reasoning=check('额外发送 reasoning_effort 字段（原预设 low；需接口接受）',cfg.sendReasoning);
  grid.append(base.wrap,key.wrap,model.wrap,max.wrap,context.wrap,temp.wrap,top.wrap,timeout.wrap);body.append(grid,element('p',''),reasoning.wrap);
  const result=element('div','about-prose');
  const read=()=>({...cfg,baseUrl:base.input.value.trim(),model:model.input.value.trim(),maxTokens:Number(max.input.value),contextChars:Number(context.input.value),temperature:Number(temp.input.value),topP:Number(top.input.value),timeoutSeconds:Number(timeout.input.value),sendReasoning:reasoning.input.checked});
  async function save(){if(key.input.value){await api('key',{key:key.input.value});keyConfigured=true;key.input.value='';}state.settings=read();await persist(true);render();}
  body.append(actions(button('保存连接',async()=>{try{await save();closeModal();toast('连接设置已保存；密钥仅在本次运行保留。');}catch(e){result.textContent=e.message;}},'primary'),button('读取模型列表',async()=>{try{await save();result.textContent='正在读取模型列表…';const j=await api('models',{settings:read()});dl.replaceChildren(...j.models.map(v=>{const o=element('option');o.value=v;return o;}));result.textContent=`接口响应成功，读取到 ${j.models.length} 个模型。这只验证列表接口，不代表生成已通过。`;toast('模型列表已更新，可在模型名输入框选择。');}catch(e){result.textContent=e.message;}}),button('清除本次密钥',async()=>{await api('key',{key:''});keyConfigured=false;key.input.value='';toast('本次密钥已清除。');},'text-button')),result);
}
function openProfile(){
  const body=openModal('角色与世界资料','profile'),card=currentCard(),p=card?.profile || session().profile,grid=element('div','form-grid');
  body.append(notice('角色定义与世界书选择由角色卡库统一维护；当前故事的消息、MVU 变量快照单独保存。运行框架及脚本开关在角色卡库中设置。'));
  const fields={};
  for(const [k,label,kind,full] of [['name','故事角色名','text',false],['userName','你的角色名','text',false],['description','角色描述','textarea',true],['personality','角色性格','textarea',true],['scenario','开场场景','textarea',true],['persona','你的角色资料','textarea',true],['firstMessage','开场白','textarea',true],['examples','对话示例','textarea',true],['worldBefore','前置世界资料','textarea',true],['worldAfter','后置世界资料','textarea',true]]){
    fields[k]=field(label,p[k],kind,full);grid.append(fields[k].wrap);
  }body.append(grid);
  const books=state.library.worldbooks.filter(b=>card?.enabledWorldbookIds.includes(b.id)),world=element('div');world.append(element('h3','',`此角色启用的世界书 · ${books.length} 本`));
  for(const book of books)world.append(element('div','world-row',`${book.name} · ${book.entries.length} 条`));body.append(world);
  const saveFields=()=>{for(const [k,v] of Object.entries(fields))p[k]=v.input.value;if(card)syncCard(card);};
  body.append(actions(button('保存资料',async()=>{saveFields();await persist(true);closeModal();render();toast('角色资料已保存。');},'primary'),button('把开场白加入当前故事',async()=>{if(!fields.firstMessage.input.value.trim())return toast('先填一段开场白。');if(session().messages.length)return toast('当前故事已有消息，请在新故事中使用开场白。');saveFields();session().messages.push({id:uid(),role:'assistant',content:p.firstMessage.replaceAll('{{user}}',p.userName).replaceAll('{{char}}',p.name),timestamp:Date.now(),mode:'theater',status:'complete'});const r=await api('runtime/recalculate',{state,fromIndex:0});state=r.state;closeModal();render();scrollBottom();}),button('选择世界书与运行框架',()=>{saveFields();openCardSettings(card.id);}),button('导入世界书',()=>{saveFields();$('#worldbook-file').click();}),button('导入角色卡',()=>$('#character-file').click(),'text-button')));
}
function openPresets(term=''){
  const body=openModal('预设控制台 · 原版 53 条目','presets');body.append(notice('开关与文字按原预设顺序进入请求，原版处理器负责后续改写。灰色“宿主条目”同样保留；SPreset 配置由程序接管，不把配置 JSON 当正文发送。'));
  const controls=element('div','preset-controls'),search=element('input');search.type='search';search.placeholder='搜索名称、分组或正文…';search.value=term;controls.append(search,button('恢复原预设',()=>{confirmAction('恢复原预设？','会清除当前工作台的提示词编辑和开关改动，故事记录保留。',()=>{state.promptStates={};persist();render();openPresets();});}));body.append(controls);
  const list=element('div');body.append(list);
  function draw(){list.replaceChildren();const groups=new Map();for(const row of preset.prompts){const content=state.promptStates[row.id]?.content ?? row.content;if(![row.name,row.group,content].join(' ').toLowerCase().includes(search.value.toLowerCase()))continue;if(!groups.has(row.group))groups.set(row.group,[]);groups.get(row.group).push({...row,content});}
    for(const [group,rows] of groups){const section=element('section','preset-group');section.append(element('h3','',group));for(const row of rows){const r=element('div','preset-row');r.dataset.archived=!row.runtime;const c=check(row.name,state.promptStates[row.id]?.enabled ?? row.enabled);if(row.archivedConfig)c.input.disabled=true;
        c.input.addEventListener('change',()=>{if(row.kind==='radio'&&c.input.checked){for(const p of preset.prompts.filter(p=>p.kind==='radio'&&p.group===row.group))state.promptStates[p.id]={...state.promptStates[p.id],enabled:false};}state.promptStates[row.id]={...state.promptStates[row.id],enabled:c.input.checked};persist();render();draw();});
        r.append(c.wrap,element('small','',row.marker?'资料位置':row.archivedConfig?'配置已内置':!row.runtime?'原流程宿主条目':''),button('查看 / 编辑',()=>editPrompt(row)));section.append(r);}list.append(section);}
  }search.addEventListener('input',draw);draw();
}
function editPrompt(row){
  const body=openModal(row.name,'prompt-edit');if(row.archivedConfig){body.append(notice('完整 SPreset 配置保留在原始 JSON 备份中，程序已内置原请求处理和输出处理。日志上传关闭。'));body.append(button('返回预设列表',()=>openPresets()));return;}
  const f=field('条目原文（保留原宏与 catgodml 标记）',state.promptStates[row.id]?.content ?? row.content,'textarea',true);f.input.rows=16;body.append(f.wrap,element('small','about-prose',`标识：${row.id}。${row.marker?'这是动态资料位置，实际内容来自角色资料。':''}`),actions(button('保存',()=>{state.promptStates[row.id]={...state.promptStates[row.id],content:f.input.value};persist();openPresets();toast('条目已保存。');},'primary'),button('恢复此条原文',()=>{if(state.promptStates[row.id])delete state.promptStates[row.id].content;persist();editPrompt(row);}),button('返回',()=>openPresets(),'text-button')));
}
async function openRequest(){
  const body=openModal('实际发送请求 · 原流程重写','request');body.append(notice('此处是原版 FinalRequestProcessing 处理后的请求体，不含 API 密钥。查看不会调用模型，也不会写入新的历史账本。空白故事会使用“请继续互动游戏喵！”作为预览输入。'));
  try{const snapshot=structuredClone(state),s=snapshot.sessions.find(s=>s.id===snapshot.activeId);if(!s.messages.length)s.messages.push({id:'preview',role:'user',content:'请继续互动游戏喵！',timestamp:Date.now(),status:'complete'});
    const result=await api('preview',{state:snapshot});lastDiagnostics=result.diagnostics;
    const stats=element('div','stats');for(const [n,label] of [[result.diagnostics.characters.toLocaleString(),'请求字符（非 token）'],[result.request.messages.length,'处理后消息'],[result.request.tools?.length || 0,'工具定义'],[result.diagnostics.signatures || 0,'原兼容签名字段']]){const stat=element('div','stat');stat.append(element('strong','',n),document.createTextNode(label));stats.append(stat);}body.append(stats);
    if(result.diagnostics.warnings.length)body.append(notice(result.diagnostics.warnings.join('\n')));
    const pre=element('pre','code-view',JSON.stringify(result.request,null,2));body.append(pre,actions(button('复制请求 JSON',()=>navigator.clipboard.writeText(pre.textContent).then(()=>toast('已复制请求体。'))),button('导出请求 JSON',()=>download('Meowssiah-request.json',pre.textContent,'application/json'))),element('p','about-prose','处理脚本 SHA256：'+result.diagnostics.sourceScriptSHA256));
  }catch(e){body.append(notice(e.message));}
}
function download(name,content,type='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=element('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function openBackup(){
  const body=openModal('导入与备份','backup');body.append(notice('故事和提示词编辑都保存在本机。完整备份不含 API 密钥；建议在迁移电脑前手动导出一份。导入完整备份会替换工作区，程序保留上一版自动存档。'));
  const grid=element('div','backup-grid');
  for(const [title,desc,label,fn] of [
    ['完整工作区','导出所有故事、角色资料、原版账本、预设编辑和连接设置。','导出完整备份',()=>download('Meowssiah-workspace.json',JSON.stringify(state,null,2),'application/json')],
    ['当前故事','导出当前故事、角色定义和已选世界书，方便再次导入。','导出故事 JSON',()=>download('Meowssiah-story.json',JSON.stringify({format:'meowssiah-story',version:2,session:session(),character:currentCard(),worldbooks:state.library.worldbooks.filter(b=>currentCard()?.enabledWorldbookIds.includes(b.id))},null,2),'application/json')],
    ['阅读版','导出当前对话的 Markdown 文本，保留模型原文标签。','导出 Markdown',()=>download('Meowssiah-story.md',`# ${session().title}\n\n`+session().messages.map(m=>`## ${m.role==='user'?session().profile.userName:'小猫之神'}\n\n${m.content}`).join('\n\n---\n\n'))],
    ['带回旧故事','导入本程序的备份或故事，或酒馆导出的聊天 JSONL。','导入备份 / 聊天',()=>$('#backup-file').click()]
  ]){const card=element('section','backup-card');card.append(element('h3','',title),element('p','',desc),button(label,fn));grid.append(card);}body.append(grid,element('p','about-prose','本机数据目录：'+dataDir),actions(button('删除当前故事',()=>confirmAction('删除当前故事？','当前工作区会移除这个故事。若需保留，请先导出。',()=>{state.sessions=state.sessions.filter(s=>s.id!==state.activeId);if(!state.sessions.length)newStory();else state.activeId=state.sessions[0].id;persist();render();closeModal();}),'danger')));
}
function confirmAction(title,description,fn){const body=openModal(title,'confirm');body.append(notice(description),actions(button('确认',async()=>{closeModal();await fn();},'primary'),button('取消',closeModal)));}
function editMessage(m){if(busy)return;const body=openModal('编辑这条消息','edit-message'),f=field('原文',m.content,'textarea',true);f.input.rows=14;body.append(notice('保留后续消息原文，保存后只重算本故事从此处开始的变量快照与动态显示，不调用模型。'),f.wrap,actions(button('保存编辑',async()=>{try{m.content=f.input.value;delete m.providerCall;const r=await api('runtime/recalculate',{state,fromIndex:session().messages.indexOf(m)});state=r.state;render();closeModal();}catch(e){toast(e.message);}},'primary'),button('取消',closeModal)));}
function openAbout(){
  const body=openModal('小猫之神，走出酒馆','about');const prose=element('div','about-prose');
  prose.append(element('h3','','1.1：世界书、MVU 与提示词模板'),element('p','','世界书总库统一保存资料，每张角色卡自行选书。MVU 原更新核心、MVU Zod 与 EJS 引擎和变量作用域已接入本地运行器，按每条消息保存变量前后快照。原 Meowssiah 的 53 个条目、原请求处理、工具及签名字段、原输出处理继续保留。'),
    element('h3','','哪些地方换了宿主'),element('p','','变量与模板脚本在独立 JavaScript 运行器中执行，不接触 Node 文件权限和模型密钥。卡片 HTML 状态栏在隔离 iframe 中显示，通过本故事/本消息的接口读写变量。完整世界书扫描策略、提示词模板的全部注入/QR/STscript 能力和未知外部前端依赖仍需按实际卡适配。'),
    element('h3','','你的数据去哪里'),element('p','','原远程 SPreset 加载与日志上传保持关闭。常用状态栏依赖已放在本地；角色 HTML 如引用外部图片，会由该卡片按原图片地址加载。密钥仅留在本次进程内存，卡片界面读不到它。角色变量与世界书随本机工作区备份。'),
    element('h3','','原作者声明（保留原文）'),element('pre','',preset.originalNotice),element('p','','原始 JSON SHA256：'+preset.sourceSHA256));body.append(prose);
}
async function importCharacter(file){
  if(!file)return;if(file.size>20*1024*1024)throw Error('角色文件超过 20MB。');let body;
  if(file.name.toLowerCase().endsWith('.png')){const buffer=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<buffer.length;i+=8192)s+=String.fromCharCode(...buffer.subarray(i,i+8192));body={pngBase64:btoa(s)};}else body={json:JSON.parse(await file.text())};
  const result=await api('import-character',body);
  confirmAction('把角色带入角色库','内置世界书会加入总库并只绑定这张卡。随后新建故事，按检测到的 MVU/EJS 框架初始化开场白。',async()=>{try{newStory(result.profile);const s=session();s.title=result.profile.name+' · 新故事';if(result.profile.firstMessage)s.messages.push({id:uid(),role:'assistant',content:result.profile.firstMessage.replaceAll('{{user}}',s.profile.userName).replaceAll('{{char}}',s.profile.name),timestamp:Date.now(),mode:'theater',status:'complete'});const r=await api('runtime/recalculate',{state,fromIndex:0});state=r.state;render();scrollBottom();toast('角色、世界书与运行框架已导入。');}catch(e){render();showError('角色已保留，框架初始化提示：'+e.message);}});
}
async function importBackup(file){
  if(!file)return;if(file.size>30*1024*1024)throw Error('备份超过 30MB。');const text=await file.text();
  if(file.name.endsWith('.jsonl')){
    const rows=text.split(/\r?\n/).filter(l=>l.trim()).map(l=>JSON.parse(l));const messages=rows.filter(m=>typeof m.mes==='string').map(m=>({id:uid(),role:m.is_user?'user':'assistant',content:m.mes,timestamp:Date.parse(m.send_date)||Date.now(),status:'complete',mode:'theater',extra:m.extra || {},variables:m.variables || undefined}));
    confirmAction('导入酒馆聊天',`将在新故事中导入 ${messages.length} 条消息。角色资料需另行导入；原聊天元数据会尽量保留。`,()=>{newStory();session().title=file.name.replace(/\.jsonl$/,'');session().messages=messages;if(rows[0]?.chat_metadata)session().hostMetadata=rows[0].chat_metadata;render();persist();});return;
  }
  const data=JSON.parse(text);
  if(data.format==='meowssiah-story'&&data.session){confirmAction('导入这个故事','故事会作为新副本加入书架；附带的角色和世界书也创建副本，不覆盖现有资料。',async()=>{const s=structuredClone(data.session);s.id=uid();s.updatedAt=Date.now();if(data.character){const c=structuredClone(data.character),ids=new Map();for(const b of data.worldbooks || []){const book=structuredClone(b),old=book.id;book.id=uid();ids.set(old,book.id);state.library.worldbooks.push(book);}c.id=uid();c.enabledWorldbookIds=c.enabledWorldbookIds.map(id=>ids.get(id)).filter(Boolean);state.library.characters.push(c);s.characterId=c.id;}else s.characterId='';state.sessions.push(s);state.activeId=s.id;const result=await api('state',{state});state=result.state;render();toast('故事已导入。');});}
  else if(data.schemaVersion===1&&Array.isArray(data.sessions)){confirmAction('恢复完整工作区',`这份备份包含 ${data.sessions.length} 个故事，将替换当前工作区。请先确认已导出当前内容。`,async()=>{const result=await api('state',{state:data});state=result.state;render();toast('工作区已恢复，上一版保留在自动备份中。');});}
  else throw Error('不是本程序的故事/工作区备份。角色卡请使用“导入角色卡”。');
}
function loadDemo(){
  newStory({...blankProfile(),name:'山间旧书店',description:'山腰上一间安静的旧书店。店主记得每一本书的来处，门口总停着一只灰猫。',scenario:'秋日黄昏，旅人在雨中走进书店。'});
  const s=session();s.title='示例 · 山间旧书店（本地样例）';s.messages=[{id:uid(),role:'user',content:'我轻轻推开那扇木门。',timestamp:Date.now()-30000,mode:'theater',status:'complete'},
    {id:uid(),role:'assistant',content:'<game>门上的铜铃轻响了一声。\n\n雨水沿着外套的下摆落在门垫上，空气里是纸张、木头和一壶热茶的气味。柜台后的人合上书，抬头看了看你，又看向你身后灰蒙蒙的山路。\n\n“先坐一会儿吧。”他把一只空杯推到桌边，“山里的雨，一时半会儿停不了。”\n\n窗边的灰猫抬起一只眼睛，没有挪开它占着的那本书。</game>\n<options><option>在窗边坐下，看看灰猫压住的那本书。</option><option>接过热茶，问问书店的来历。</option><option>沿书架走一圈，找一本陌生的书。</option></options>\n<summary>秋日黄昏，旅人避雨进入山间旧书店。店主在柜台后读书，递出空杯并邀请旅人坐下。窗边有一只灰猫，占着一本尚未看清书名的书。旅人尚未选座或回应。</summary>\n<comment>这只是程序内置的本地展示样例，没有调用模型。喵，轮到你挑下一步啦。</comment>',timestamp:Date.now(),mode:'theater',status:'complete'}];render();persist();scrollBottom();toast('已载入本地示例，没有调用模型。');
}
function bind(){
  bindLibrary();
  const auto=check('场外聊天完成后自动回到剧场',session().chatAutoReturn!==false);auto.input.id='chat-auto-return';$('#note-auto-clear').closest('label').after(auto.wrap);auto.input.onchange=e=>{session().chatAutoReturn=e.target.checked;persist();};
  $('#new-story').onclick=()=>startCardStory();$('#search-stories').oninput=renderShelf;$('#open-connection').onclick=openConnection;$('#open-profile').onclick=openProfile;$('#open-presets').onclick=()=>openPresets();$('#open-backup').onclick=openBackup;$('#open-about').onclick=openAbout;$('#open-request').onclick=openRequest;
  $('#close-modal').onclick=closeModal;$('#modal').addEventListener('click',e=>{if(e.target===$('#modal')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeModal();}});
  $('#toggle-details').onclick=()=>document.body.classList.toggle('details-hidden');$('#theme-toggle').onclick=()=>{state.ui.theme=state.ui.theme==='dark'?'light':'dark';render();persist();};
  $('#rename-story').onclick=()=>{const body=openModal('为故事取个名字','rename'),f=field('故事名称',session().title);body.append(f.wrap,actions(button('保存',()=>{session().title=f.input.value.trim().slice(0,100)||'未命名的故事';persist();render();closeModal();},'primary')));f.input.focus();};
  $$('[data-mode]').forEach(b=>b.onclick=()=>{session().mode=b.dataset.mode;render();persist();});$('#deep-think').onchange=e=>{session().deepThink=e.target.checked;persist();};
  $('#director-note').oninput=e=>{session().note=e.target.value;$('#note-indicator').textContent=e.target.value.trim()?'本轮生效':'';persist();};$('#note-auto-clear').onchange=e=>{session().noteAutoClear=e.target.checked;persist();};
  $('#composer').onsubmit=e=>{e.preventDefault();send().catch(e=>showError(e.message));};$('#message-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send().catch(e=>showError(e.message));}};
  $('#stop-generation').onclick=async()=>{if(jobId)await api('stop',{jobId});else toast('请求正在准备中，稍候即可停止。');};$('#retry-message').onclick=()=>send(true).catch(e=>showError(e.message));
  $('#import-character').onclick=$('#welcome-import').onclick=()=>$('#character-file').click();$('#character-file').onchange=e=>{importCharacter(e.target.files[0]).catch(e=>toast(e.message));e.target.value='';};
  $('#worldbook-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;const j=await api('library/import-worldbook',{name:file.name.replace(/\.json$/i,''),json:JSON.parse(await file.text())});state.library.worldbooks.push(j.worldbook);currentCard().enabledWorldbookIds.push(j.worldbook.id);await persist(true);updateLibraryBadges();openProfile();toast(`已加入总库，并为当前卡启用 ${j.worldbook.entries.length} 条资料。`);}catch(e){toast(e.message);}finally{e.target.value='';}};
  $('#backup-file').onchange=e=>{importBackup(e.target.files[0]).catch(e=>toast(e.message));e.target.value='';};$('#load-demo').onclick=loadDemo;
  $$('[data-starter]').forEach(b=>b.onclick=()=>{$('#message-input').value=b.dataset.starter;$('#message-input').focus();});
}
async function boot(){try{const b=await api('bootstrap');state=b.state;preset=b.preset;keyConfigured=b.keyConfigured;dataDir=b.dataDir;bind();render();if(b.notice)showError(b.notice);}catch(e){showError('启动出错：'+e.message);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
