'use strict';
const frameRegistry=new Map();
let framePageClosing=false;
function releaseFrameNonces(nonces,keepalive=false){
  if(!nonces.length)return Promise.resolve();
  return fetch('/api/card-frame/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nonces}),keepalive}).catch(()=>{});
}
function releaseDisconnectedCardFrames(){
  const nonces=[];for(const [nonce,reg] of frameRegistry)if(!reg.frame.isConnected){frameRegistry.delete(nonce);nonces.push(nonce);}return releaseFrameNonces(nonces);
}
function cardContextVersion(){return session().id+':'+state.revision+':'+session().messages.length;}
function syncCardFrameContext(){
  const s=session(),version=cardContextVersion();let shared;
  for(const [nonce,reg] of frameRegistry){if(!reg.frame.isConnected||reg.sessionId!==s.id||reg.contextVersion===version)continue;const message=s.messages.find(m=>m.id===reg.messageId);if(!message)continue;
    shared ||= {messages:s.messages.map(m=>({id:m.id,role:m.role,content:m.content,data:m.runtime?.after || {}})),characterVariables:currentCard()?.variables || {},globalVariables:state.library.globalVariables || {}};
    reg.frame.contentWindow?.postMessage({meowFrame:true,nonce,type:'context-refresh',...shared,current:message.runtime?.after || {stat_data:{}},localVariables:message.runtime?.localVariables || {}},'*');reg.contextVersion=version;
  }
}
window.addEventListener('pagehide',()=>{framePageClosing=true;const nonces=[...frameRegistry.keys()];frameRegistry.clear();releaseFrameNonces(nonces,true);});
function storyCard(s=session()){const card=state.library?.characters.find(c=>c.id===s?.characterId);return card || (s?.detachedCharacter?{...s.detachedCharacter,name:s.profile.name,profile:s.profile}:null);}
function currentCard(){return storyCard();}
function cardSnapshot(card){return {id:card.id,name:card.profile.name,origin:card.origin || 'deleted-card',variables:structuredClone(card.variables || {}),enabledWorldbookIds:[...(card.enabledWorldbookIds || [])],createdAt:card.createdAt,updatedAt:Date.now()};}
function registerProfile(p){
  state.library ||= {version:1,worldbooks:[],characters:[],globalVariables:{}};
  const profile=structuredClone(p),card={id:uid(),name:profile.name,profile,variables:{},enabledWorldbookIds:[],createdAt:Date.now(),updatedAt:Date.now()};
  profile.compat ||= {mvu:false,ejs:false,cardHtml:true};profile.regexes ||= [];profile.helperScripts ||= [];
  if(profile.worldbook?.length){const b={id:uid(),name:profile.name+' · 内置世界书',entries:structuredClone(profile.worldbook),source:'角色卡内置',createdAt:Date.now(),updatedAt:Date.now()};state.library.worldbooks.push(b);card.enabledWorldbookIds.push(b.id);}
  state.library.characters.push(card);return card;
}
function syncCard(card){card.name=card.profile.name;card.updatedAt=Date.now();if(state.library.characters.some(c=>c.id===card.id)){for(const s of state.sessions)if(s.characterId===card.id)s.profile=structuredClone(card.profile);}
  else if(session()?.detachedCharacter?.id===card.id){session().profile=structuredClone(card.profile);session().detachedCharacter=cardSnapshot(card);}}
async function startCardStory(card=currentCard()){
  if(busy)return;
  try{await persist(true);closeModal();newStory(card?.profile || null,card?.id || null,false);const s=session(),p=s.profile;
    if(p.firstMessage){s.messages.push({id:uid(),role:'assistant',content:p.firstMessage.replaceAll('{{user}}',p.userName).replaceAll('{{char}}',p.name),timestamp:Date.now(),mode:'theater',status:'complete'});
      renderMessages();await initializeStory(0);}
    else await persist(true);
  }catch(e){showError('故事已创建，框架初始化提示：'+e.message);}
}
function updateLibraryBadges(){
  $('#character-library-count').textContent=state.library?.characters.length || 0;$('#worldbook-library-count').textContent=state.library?.worldbooks.length || 0;
}
function openCharacters(){
  const body=openModal('角色卡库 · 每张卡独立选书','characters');body.append(notice('角色定义与世界书绑定保存在角色库；同一张卡可以开多个故事，各故事的 MVU 变量分开保存。'));
  body.append(actions(button('导入角色卡 JSON / PNG',()=>$('#character-file').click(),'primary'),button('创建空白角色卡',()=>{const c=registerProfile(blankProfile());persist();openCardSettings(c.id);} )));
  const list=element('div','library-list');body.append(list);
  for(const card of state.library.characters){const row=element('section','library-card'),p=card.profile;row.dataset.characterId=card.id;const head=element('div','section-heading');head.append(element('h3','',p.name),element('span','pill',card.id===session().characterId?'当前角色':`${card.enabledWorldbookIds.length} 本世界书`));
    row.append(head,element('p','about-prose',p.description?.slice(0,140) || '尚未填写角色描述。'),element('small','about-prose',`${p.compat?.mvu?'MVU 已开启':'MVU 未开启'} · ${p.compat?.ejs?'EJS 模板已开启':'EJS 模板未开启'} · ${p.helperScripts?.length || 0} 个脚本`),
      actions(button('用这张卡开新故事',()=>startCardStory(card)),button('编辑与世界书绑定',()=>openCardSettings(card.id)),button('导出角色卡',()=>{
        const raw=structuredClone(p.rawCard || {spec:'chara_card_v2',spec_version:'2.0',data:{}}),d=raw.data || raw;
        Object.assign(d,{name:p.name,description:p.description,personality:p.personality,scenario:p.scenario,first_mes:p.firstMessage,mes_example:p.examples});
        d.extensions ||= {};d.extensions.regex_scripts=p.regexes || [];d.extensions.tavern_helper ||= {};d.extensions.tavern_helper.scripts=p.helperScripts || [];
        d.character_book={...(d.character_book || {}),name:p.name+' · 已启用世界书',entries:state.library.worldbooks.filter(b=>card.enabledWorldbookIds.includes(b.id)).flatMap(b=>b.entries)};
        download(p.name+'.json',JSON.stringify(raw,null,2),'application/json');
      },'text-button'),button('删除角色卡',()=>openDeleteCharacter(card.id),'danger')));list.append(row);
  }
  if(!state.library.characters.length)list.append(element('div','empty','角色库暂时为空，可以导入或新建角色卡。'));
}
function openDeleteCharacter(id){
  if(busy)return;const card=state.library.characters.find(c=>c.id===id);if(!card)return;
  const related=state.sessions.filter(s=>s.characterId===id),body=openModal('删除角色卡','delete-character');
  body.append(notice(`从角色库删除「${card.profile.name}」。世界书继续留在总库。`));
  const deleteChats=check(`同时删除这张卡的 ${related.length} 段聊天`,false);deleteChats.input.id='delete-character-chats';
  if(related.length)body.append(element('p','about-prose',`已有 ${related.length} 段聊天。保留聊天时会保存角色快照，消息、变量和选书都可以继续使用。`),deleteChats.wrap);
  const result=element('p','about-prose');let deleting=false;
  body.append(actions(button('确认删除',async()=>{
    if(deleting||busy)return;deleting=true;const oldActive=state.activeId;
    try{await persist(true);const r=await api('library/delete-character',{state,characterId:id,deleteChats:deleteChats.input.checked});state=r.state;
      for(const chatId of r.removedChatIds)chatDrafts.delete(chatId);if(oldActive!==state.activeId)$('#message-input').value=chatDrafts.get(state.activeId)||'';
      render();openCharacters();toast(deleteChats.input.checked?'角色卡及关联聊天已删除。':'角色卡已删除，聊天已保留。');
    }catch(e){deleting=false;result.textContent=e.message;}
  },'danger'),button('取消',openCharacters)),result);
}
function worldbookGroup(title,enabled,kind){
  const section=element('section','worldbook-group'+(enabled?'':' worldbook-group--off')),head=element('div','worldbook-group-heading'),count=element('span','worldbook-count','0'),items=element('div','worldbook-group-items'),empty=element('p','worldbook-group-empty',enabled?'这里还没有已启用的'+kind+'。':'这里没有未启用的'+kind+'。');
  section.dataset.enabled=String(enabled);head.append(element('h3','',title),count);section.append(head,items,empty);
  return {section,items,update(n){count.textContent=String(n);empty.hidden=n>0;}};
}
function bindWorldbooks(books,selected,onEnable){
  const wrap=element('div','worldbook-groups book-binding-groups'),on=worldbookGroup('已启用世界书',true,'世界书'),off=worldbookGroup('未启用世界书',false,'世界书');wrap.append(on.section,off.section);
  const rows=books.map(book=>{
    const choice=check('',selected.has(book.id));choice.wrap.classList.add('book-binding');choice.wrap.dataset.bookId=book.id;choice.input.setAttribute('aria-label',book.name);
    const info=element('span','book-binding-info'),badge=element('span','worldbook-state');info.append(element('strong','',book.name),element('small','',book.entries.length+' 条'));choice.wrap.append(info,badge);
    choice.input.onchange=()=>{if(choice.input.checked){selected.add(book.id);onEnable(book);}else selected.delete(book.id);arrange();};
    return {book,...choice,badge};
  });
  function arrange(){let active=0;const focus=document.activeElement;
    for(const row of rows){const enabled=selected.has(row.book.id);row.input.checked=enabled;row.badge.textContent=enabled?'已启用':'未启用';row.wrap.dataset.enabled=String(enabled);(enabled?on:off).items.append(row.wrap);if(enabled)active++;}
    on.update(active);off.update(rows.length-active);if(focus&&wrap.contains(focus))focus.focus({preventScroll:true});
  }
  arrange();return wrap;
}
function worldbookMode(constant,tag='span'){
  const badge=element(tag,'worldbook-mode'),lamp=element('span','worldbook-lamp'),label=element('span');lamp.setAttribute('aria-hidden','true');badge.append(lamp,label);
  const update=value=>{badge.dataset.activation=value?'constant':'keyword';label.textContent=value?'常驻':'关键词激活';};update(constant);return {badge,update};
}
function openCardSettings(id){
  const card=state.library.characters.find(c=>c.id===id) || (currentCard()?.id===id?currentCard():null);if(!card)return;const draft=structuredClone(card),p=draft.profile,inLibrary=state.library.characters.some(c=>c.id===id);
  const body=openModal((inLibrary?'角色设置 · ':'聊天角色快照 · ')+p.name,'card-settings'),grid=element('div','form-grid'),fields={};
  for(const [k,label,kind,full] of [['name','角色名','text',false],['userName','玩家名','text',false],['description','角色描述','textarea',true],['personality','角色性格','textarea',true],['scenario','场景','textarea',true],['persona','玩家资料','textarea',true],['firstMessage','开场白','textarea',true],['examples','对话示例','textarea',true]]){fields[k]=field(label,p[k],kind,full);grid.append(fields[k].wrap);}body.append(grid);
  body.append(element('h3','library-heading','为这张卡启用世界书'));
  body.append(element('p','about-prose','只勾选这张卡要用的书，不会自动给其他角色启用。修改后对该卡后续请求生效，已有消息的变量快照保留。'));
  const selected=new Set(draft.enabledWorldbookIds);
  if(state.library.worldbooks.length)body.append(bindWorldbooks(state.library.worldbooks,selected,b=>{if(b.entries.some(e=>/\[initvar\]/i.test(e.name)))mvu.input.checked=true;if(b.entries.some(e=>e.content.includes('<%')))ejs.input.checked=true;}));
  if(!state.library.worldbooks.length)body.append(notice('总库还是空的。先到“世界书总库”创建或导入。'));
  body.append(element('h3','library-heading','运行框架'));
  const mvu=check('运行 MVU：由当前对话模型随回复更新，保存每条消息变量快照',p.compat?.mvu),ejs=check('运行提示词模板：EJS 条件、循环、getvar / setvar',p.compat?.ejs),html=check('显示角色卡的 HTML 状态栏',p.compat?.cardHtml!==false);
  for(const c of [mvu,ejs,html]){c.wrap.classList.add('book-binding');body.append(c.wrap);}
  const scripts=field('卡片脚本 JSON（原有内容保留，可启用/停用）',JSON.stringify(p.helperScripts || [],null,2),'textarea',true,'MVU 核心与 mvu_zod 已本地化；已知模块引用会映射到本地，未知远程依赖会显示具体错误。'),regexes=field('角色卡显示正则 JSON',JSON.stringify(p.regexes || [],null,2),'textarea',true);
  const advanced=element('details','message-extra');advanced.append(element('summary','','查看 / 编辑卡片脚本与正则'),scripts.wrap,regexes.wrap);body.append(advanced);
  const result=element('div','about-prose');body.append(actions(button('保存角色与选书',async()=>{try{
    for(const [k,v] of Object.entries(fields))p[k]=v.input.value;
    p.compat={mvu:mvu.input.checked,ejs:ejs.input.checked,cardHtml:html.input.checked};p.helperScripts=JSON.parse(scripts.input.value);p.regexes=JSON.parse(regexes.input.value);
    if(!Array.isArray(p.helperScripts)||!Array.isArray(p.regexes))throw Error('脚本与正则 JSON 应是数组。');
    draft.enabledWorldbookIds=[...selected];Object.assign(card,draft);syncCard(card);await persist(true);render();if(inLibrary)openCharacters();else closeModal();toast(inLibrary?'角色与世界书绑定已保存。':'当前聊天的角色快照已保存。');
  }catch(e){result.textContent=e.message;}},'primary'),button('返回角色库',openCharacters),...(inLibrary?[button('删除角色卡',()=>openDeleteCharacter(id),'danger')]:[])),result);
}
function openWorldbooks(searchText=''){
  const body=openModal('世界书总库','worldbooks');body.append(notice('在这里统一保存和编辑世界书，再到“角色卡库 → 编辑与世界书绑定”为每张卡勾选。'));
  const controls=element('div','preset-controls'),search=element('input');search.type='search';search.placeholder='搜索世界书或条目…';search.value=searchText;
  controls.append(search,button('导入 JSON',()=>$('#library-book-file').click(),'primary'),button('新建世界书',()=>editWorldbook({id:uid(),name:'新世界书',entries:[],source:'用户创建',createdAt:Date.now(),updatedAt:Date.now()},true)));body.append(controls);
  const list=element('div','library-list');body.append(list);
  const draw=()=>{list.replaceChildren();for(const b of state.library.worldbooks.filter(b=>(b.name+' '+b.entries.map(e=>e.name).join(' ')).toLowerCase().includes(search.value.toLowerCase()))){
    const row=element('section','library-card'),bound=state.library.characters.filter(c=>c.enabledWorldbookIds.includes(b.id));
    row.dataset.bookId=b.id;const h=element('div','section-heading'),enabled=b.entries.filter(e=>e.enabled!==false).length;h.append(element('h3','',b.name),element('span','pill',b.entries.length+' 条'));row.append(h,element('p','worldbook-overview',`已启用 ${enabled} 条 · 未启用 ${b.entries.length-enabled} 条`),element('p','about-prose',bound.length?'已绑定：'+bound.map(c=>c.name).join('、'):'尚未绑定角色'),
      actions(button('编辑条目',()=>editWorldbook(b)),button('导出',()=>download(b.name+'.json',JSON.stringify({name:b.name,entries:Object.fromEntries(b.entries.map((e,i)=>[i,{...e,uid:i,key:e.keys,keysecondary:e.secondary,comment:e.name,disable:!e.enabled,position:e.originalPosition}]))},null,2),'application/json')),button('删除',()=>confirmAction('删除世界书？',`将从总库移除「${b.name}」，并解除 ${bound.length} 张卡的绑定。已保存消息不受影响。`,()=>{state.library.worldbooks=state.library.worldbooks.filter(v=>v.id!==b.id);for(const c of bound)c.enabledWorldbookIds=c.enabledWorldbookIds.filter(id=>id!==b.id);persist();updateLibraryBadges();openWorldbooks();}),'text-button')));list.append(row);
  }if(!list.childElementCount)list.append(element('div','empty','总库中还没有世界书。可以导入独立世界书 JSON，或导入带内置世界书的角色卡。'));};search.oninput=draw;draw();
}
function editWorldbook(book,isNew=false){
  const draft=structuredClone(book),body=openModal('编辑世界书','book-edit'),name=field('世界书名称',draft.name);body.append(name.wrap);
  const legend=element('div','worldbook-legend');legend.append(worldbookMode(true).badge,element('span','','不检查关键词'),worldbookMode(false).badge,element('span','','匹配关键词后激活'));body.append(legend,element('p','about-prose worldbook-sort-note','已启用在上，未启用在下；各区按插入顺序从小到大排列，同号保留原先次序。点灯切换常驻 / 关键词，修改后点击“保存世界书”。'));
  const list=element('div','worldbook-groups entry-groups'),on=worldbookGroup('已启用条目',true,'条目'),off=worldbookGroup('未启用条目',false,'条目'),editors=new Map();list.append(on.section,off.section);body.append(list);
  const orderValue=row=>Number.isFinite(Number(row.order))?Number(row.order):100;
  function arrange(){const focus=document.activeElement;let count=0;
    const sorted=draft.entries.map((row,index)=>({row,index})).sort((a,b)=>orderValue(a.row)-orderValue(b.row)||a.index-b.index);
    for(const {row} of sorted){const editor=editors.get(row);editor.refresh();const enabled=row.enabled!==false;(enabled?on:off).items.append(editor.details);if(enabled)count++;}
    on.update(count);off.update(draft.entries.length-count);if(focus&&list.contains(focus))focus.focus({preventScroll:true});
  }
  function addEditor(row,open=false){
    const details=element('details','entry-editor'),summary=element('summary'),heading=element('span','entry-heading'),titleText=element('strong','entry-title'),hint=element('small','entry-hint'),meta=element('span','entry-meta'),orderBadge=element('span','entry-order'),mode=worldbookMode(row.constant,'button'),toggle=element('button','entry-toggle');details.open=open;details.dataset.entryId=String(row.id);mode.badge.type=toggle.type='button';mode.badge.classList.add('entry-mode');heading.append(titleText,hint);meta.append(orderBadge,mode.badge,toggle);summary.append(heading,meta);details.append(summary);
    const grid=element('div','form-grid'),title=field('条目标题',row.name),keys=field('触发关键词（逗号分隔）',(row.keys || []).join(', ')),secondary=field('辅助关键词',(row.secondary || []).join(', ')),order=field('插入顺序',row.order ?? 100,'number'),content=field('条目正文 / EJS 模板 / InitVar YAML',row.content,'textarea',true);
    order.input.min='-10000';order.input.max='10000';order.input.step='any';
    const pos=selectField('插入位置',String(row.originalPosition ?? 0),[['0','角色资料之前'],['1','角色资料之后'],['4','聊天深度位置']]),depth=field('深度（位置为深度时生效）',row.depth ?? 4,'number');
    for(const f of [title,keys,secondary,order,pos,depth,content])grid.append(f.wrap);details.append(grid);
    const enabled=check('启用条目',row.enabled!==false),constant=check('常驻（忽略关键词）',row.constant),selective=check('同时匹配辅助关键词',row.selective);
    details.append(actions(enabled.wrap,constant.wrap,selective.wrap,button('移除此条',()=>{draft.entries.splice(draft.entries.indexOf(row),1);editors.delete(row);details.remove();arrange();},'text-button')));
    function refresh(){const active=row.enabled!==false,label=row.name || '新条目';details.dataset.enabled=String(active);titleText.textContent=label;hint.textContent=row.constant?'不检查关键词':(row.keys?.length?'触发词：'+row.keys.join('、'):'尚未设置触发关键词');orderBadge.textContent='顺序 '+orderValue(row);mode.update(row.constant);mode.badge.title=row.constant?'常驻，不检查关键词；点击切换为关键词激活':'匹配关键词后激活；点击切换为常驻';mode.badge.setAttribute('aria-label',`${row.constant?'常驻':'关键词激活'}：${label}，点击切换模式`);mode.badge.setAttribute('aria-pressed',String(!!row.constant));toggle.textContent=active?'已启用':'未启用';toggle.setAttribute('aria-pressed',String(active));toggle.setAttribute('aria-label',`${active?'停用':'启用'}条目：${label}`);enabled.input.checked=active;constant.input.checked=!!row.constant;}
    function setEnabled(value){row.enabled=value;row.disable=!value;arrange();}
    for(const control of [mode.badge,toggle])control.onclick=event=>{event.preventDefault();event.stopPropagation();if(control===toggle)setEnabled(row.enabled===false);else {row.constant=!row.constant;refresh();}};
    title.input.oninput=()=>{row.name=title.input.value;refresh();};keys.input.oninput=()=>{row.keys=keys.input.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean);refresh();};secondary.input.oninput=()=>row.secondary=secondary.input.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean);
    content.input.oninput=()=>row.content=content.input.value;order.input.oninput=()=>{row.order=Math.max(-10000,Math.min(10000,Number(order.input.value)||0));refresh();};order.input.onchange=()=>{order.input.value=orderValue(row);arrange();};pos.input.onchange=()=>{row.originalPosition=Number(pos.input.value);row.position=row.originalPosition===1?'after':'before';};depth.input.oninput=()=>row.depth=Number(depth.input.value);
    enabled.input.onchange=()=>setEnabled(enabled.input.checked);constant.input.onchange=()=>{row.constant=constant.input.checked;refresh();};selective.input.onchange=()=>row.selective=selective.input.checked;
    editors.set(row,{details,refresh});
  }
  for(const row of draft.entries)addEditor(row,draft.entries.length<4);arrange();
  const footer=actions(button('新增条目',()=>{const row={id:uid(),name:'新条目',content:'',keys:[],secondary:[],enabled:true,constant:true,order:100,originalPosition:0,depth:4,position:'before'};draft.entries.push(row);addEditor(row,true);arrange();const editor=editors.get(row).details;editor.scrollIntoView({block:'nearest'});editor.querySelector('input').focus({preventScroll:true});}),
    button('保存世界书',async()=>{draft.name=name.input.value.trim()||'未命名世界书';draft.updatedAt=Date.now();if(isNew)state.library.worldbooks.push(draft);else Object.assign(book,draft);await persist(true);updateLibraryBadges();openWorldbooks();toast('世界书已保存，绑定它的角色会共用这份内容。');},'primary'),button('返回',openWorldbooks));footer.classList.add('worldbook-editor-actions');body.append(footer);
}
async function openVariables(){
  const body=openModal('当前聊天 · 变量与运行','variables');body.append(notice('每段聊天单独保存变量。下方显示最近一条消息的变量快照，空白聊天显示初始化结果。'));
  const area=element('div','about-prose','正在读取本地框架状态…');body.append(area);
  try{const result=await api('runtime/inspect',{state}),last=session().messages.findLast(m=>m.role==='assistant'&&m.runtime),stats=element('div','stats');
    for(const [value,label] of [[result.compat.mvu?'开启':'关闭','MVU'],[result.compat.ejs?'开启':'关闭','EJS 提示词模板'],[result.schemaRegistered?'已注册':'未注册','Zod 变量结构'],[result.books.length,'启用世界书']]){const stat=element('div','stat');stat.append(element('strong','',value),document.createTextNode(label));stats.append(stat);}area.replaceChildren(stats);
    const current=last?.runtime.after || result.current || {stat_data:{}},update=last?.runtime.mvuUpdate;
    area.append(element('p','about-prose','更新方式：当前对话模型随回复输出指令，本地 MVU 执行；每轮一条模型请求。'));
    if(update){const labels={updated:'已更新',unchanged:'已检查，无字段变化',missing:'未收到更新指令',invalid:'更新块没有有效指令',error:'执行出错'};const line=element('p','about-prose',`最近一条消息的变量更新：${labels[update.status] || update.status} · ${update.commands} 条指令`);line.id='mvu-update-result';area.append(line);}
    area.append(element('h3','','当前 stat_data'),element('pre','code-view',JSON.stringify(current.stat_data || {},null,2)));
    const errors=[...(result.errors || []),...(last?.runtime.errors || [])],warnings=[...(result.warnings || []),...(last?.runtime.warnings || [])];if(errors.length)area.append(notice('更新错误：\n'+errors.join('\n')));if(warnings.length)area.append(notice('运行提示：\n'+warnings.join('\n')));
    area.append(element('p','about-prose','已选世界书：'+result.books.map(b=>`${b.name}（${b.entries} 条）`).join('、')));
    const edit=field('手动编辑当前 stat_data（JSON）',JSON.stringify(current.stat_data || {},null,2),'textarea',true,'提交时通过当前卡的 MVU/Zod 规则计算。已有消息会保留更新前后的快照。');area.append(edit.wrap);
    area.append(actions(button('提交变量修改',async()=>{try{const value=JSON.parse(edit.input.value),reply=await api('runtime/parse',{state,old:current,text:'<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:'',value}])+'</JSONPatch></UpdateVariable>'});if(reply.errors.length)throw Error(reply.errors.join('\n'));const m=session().messages.findLast(m=>m.role==='assistant');if(m)m.runtime={...(m.runtime || {}),after:reply.current};else session().runtime={...(session().runtime || {}),initial:reply.current};await persist(true);openVariables();toast('变量已按当前规则更新。');}catch(e){toast(e.message);}},'primary'),button('按当前资料重算本故事',()=>confirmAction('重新计算本故事变量？','仅重算当前故事，保留消息原文。已有变量快照会按当前选书、脚本与规则重新生成；不调用模型。',async()=>{try{const r=await api('runtime/recalculate',{state,fromIndex:0});state=r.state;render();openVariables();toast('本故事的变量与显示结果已重算。');}catch(e){toast(e.message);}}))));
  }catch(e){area.textContent=e.message;}
}
function cardFrame(html,message){
  const frame=element('iframe','card-frame');frame.setAttribute('sandbox','allow-scripts allow-forms');frame.setAttribute('title','角色卡界面');frame.height='260';frame.setAttribute('loading','lazy');
  frame.addEventListener('load',()=>{if(!frame.getAttribute('src'))return;frame.dataset.loaded='true';for(const reg of frameRegistry.values())if(reg.frame===frame)reg.contextVersion='';settleMessageLayout(frame);syncCardFrameContext();});const contextVersion=cardContextVersion();
  const s=session(),index=s.messages.findIndex(m=>m.id===message.id),seed={messageId:index,current:message.runtime?.after || {stat_data:{}},characterVariables:currentCard()?.variables || {},localVariables:message.runtime?.localVariables || {},globalVariables:state.library.globalVariables || {},messages:s.messages.map(m=>({id:m.id,role:m.role,content:m.content,data:m.runtime?.after || {}}))};
  api('card-frame',{html,seed}).then(data=>{if(framePageClosing||!frame.isConnected){releaseFrameNonces([data.nonce]);return;}frame.src=data.url;frameRegistry.set(data.nonce,{frame,sessionId:s.id,messageId:message.id,contextVersion});releaseDisconnectedCardFrames();}).catch(e=>{if(frame.isConnected){const box=frame.closest('.message');frame.replaceWith(element('div','notice','卡片界面加载出错：'+e.message));if(box)box.style.minHeight='';restoreReadingAnchor();}});return frame;
}
function splitCardDisplay(raw){
  const blocks=[];let text=String(raw).replace(/```(?:html)?\s*\n([\s\S]*?)```/gi,(all,body)=>{if(!/<(?:html|style|script|div|section|table)\b/i.test(body))return all;blocks.push(body);return '';});
  if(/<(?:html|style|script|div|section|table)\b/i.test(text)){blocks.push(text);text='';}return {text:text.replace(/<StatusPlaceHolderImpl\s*\/>/gi,''),blocks};
}
window.addEventListener('message',async event=>{
  const data=event.data;if(!data?.meowFrame)return;const reg=frameRegistry.get(data.nonce);if(!reg || event.source!==reg.frame.contentWindow)return;
  if(data.type==='resize'){reg.frame.height=String(Math.max(100,Math.min(2000,Number(data.height)||260)));settleMessageLayout(reg.frame);return;}
  if(data.type==='interaction'){readingAnchor=null;followLatest=false;return;}
  if(data.type==='scroll'){if(reg.sessionId===state.activeId){readingAnchor=null;followLatest=false;$('#chat-scroll').scrollBy({top:Math.max(-2000,Math.min(2000,Number(data.deltaY)||0)),behavior:'instant'});}return;}
  if(data.type==='error'){toast('卡片界面：'+data.error);return;}
  if(data.type!=='request')return;
  const respond=(value,error)=>reg.frame.contentWindow?.postMessage({meowFrame:true,nonce:data.nonce,type:'response',id:data.id,value,error},'*');
  try{
    if(busy)throw Error('生成期间先保留当前状态，完成后再修改变量。');
    const story=state.sessions.find(s=>s.id===reg.sessionId),message=story?.messages.find(m=>m.id===reg.messageId);if(!message || story.id!==state.activeId)throw Error('这条卡片界面已离开当前故事。');
    if(data.action==='parse'){const r=await api('runtime/parse',{state,old:data.old,text:data.text});if(r.errors.length)throw Error(r.errors.join('\n'));return respond(r.current);}
    if(data.action==='replace'){
      const type=data.options?.type || 'message';
      if(!data.value || typeof data.value!=='object' || Array.isArray(data.value))throw Error('变量内容应为 JSON 对象。');
      if(type==='character'){const card=currentCard();card.variables=structuredClone(data.value);if(session().detachedCharacter)session().detachedCharacter.variables=card.variables;await persist(true);return respond(card.variables);}
      if(type==='global'){state.library.globalVariables=structuredClone(data.value);await persist(true);return respond(state.library.globalVariables);}
      if(type==='chat'){message.runtime={...(message.runtime || {}),localVariables:structuredClone(data.value)};await persist(true);return respond(message.runtime.localVariables);}
      if(type!=='message')throw Error('未识别的变量类型。');
      let index=data.options?.message_id ?? story.messages.indexOf(message);if(index==='latest')index=story.messages.length-1;index=Number(index);if(index<0)index+=story.messages.length;
      const target=story.messages[index];if(!target)throw Error('消息楼层不存在。');
      const reply=await api('runtime/parse',{state,old:target.runtime?.after || {stat_data:{}},text:'<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:'',value:data.value.stat_data || {}}])+'</JSONPatch></UpdateVariable>'});
      if(reply.errors.length)throw Error(reply.errors.join('\n'));target.runtime={...(target.runtime || {}),after:reply.current};await persist(true);return respond(reply.current);
    }throw Error('未识别的卡片状态操作。');
  }catch(e){respond(null,e.message);}
});
function bindLibrary(){
  $('#open-characters').onclick=openCharacters;$('#open-worldbooks').onclick=()=>openWorldbooks();$('#open-variables').onclick=openVariables;
  const input=element('input');input.type='file';input.accept='.json';input.multiple=true;input.id='library-book-file';input.hidden=true;document.body.append(input);
  input.onchange=async()=>{try{let count=0;for(const file of input.files){const result=await api('library/import-worldbook',{name:file.name.replace(/\.json$/i,''),json:JSON.parse(await file.text())});state.library.worldbooks.push(result.worldbook);count++;}await persist(true);updateLibraryBadges();openWorldbooks();toast(`已导入 ${count} 本世界书，可在角色设置中勾选启用。`);}catch(e){toast(e.message);}finally{input.value='';}};
}
