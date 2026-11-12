'use strict';
const frameRegistry=new Map();
function currentCard(){return state.library?.characters.find(c=>c.id===session().characterId);}
function registerProfile(p){
  state.library ||= {version:1,worldbooks:[],characters:[],globalVariables:{}};
  const profile=structuredClone(p),card={id:uid(),name:profile.name,profile,enabledWorldbookIds:[],createdAt:Date.now(),updatedAt:Date.now()};
  profile.compat ||= {mvu:false,ejs:false,cardHtml:true};profile.regexes ||= [];profile.helperScripts ||= [];
  if(profile.worldbook?.length){const b={id:uid(),name:profile.name+' · 内置世界书',entries:structuredClone(profile.worldbook),source:'角色卡内置',createdAt:Date.now(),updatedAt:Date.now()};state.library.worldbooks.push(b);card.enabledWorldbookIds.push(b.id);}
  state.library.characters.push(card);return card;
}
function syncCard(card){card.name=card.profile.name;card.updatedAt=Date.now();for(const s of state.sessions)if(s.characterId===card.id)s.profile=structuredClone(card.profile);}
async function startCardStory(card=currentCard()){
  try{closeModal();newStory(card?.profile || null,card?.id || null);const s=session(),p=s.profile;
    if(p.firstMessage){s.messages.push({id:uid(),role:'assistant',content:p.firstMessage.replaceAll('{{user}}',p.userName).replaceAll('{{char}}',p.name),timestamp:Date.now(),mode:'theater',status:'complete'});
      const r=await api('runtime/recalculate',{state,fromIndex:0});state=r.state;render();scrollBottom();}
  }catch(e){showError('故事已创建，框架初始化提示：'+e.message);}
}
function updateLibraryBadges(){
  $('#character-library-count').textContent=state.library?.characters.length || 0;$('#worldbook-library-count').textContent=state.library?.worldbooks.length || 0;
}
function openCharacters(){
  const body=openModal('角色卡库 · 每张卡独立选书','characters');body.append(notice('角色定义与世界书绑定保存在角色库；同一张卡可以开多个故事，各故事的 MVU 变量分开保存。'));
  body.append(actions(button('导入角色卡 JSON / PNG',()=>$('#character-file').click(),'primary'),button('创建空白角色卡',()=>{const c=registerProfile(blankProfile());persist();openCardSettings(c.id);} )));
  const list=element('div','library-list');body.append(list);
  for(const card of state.library.characters){const row=element('section','library-card'),p=card.profile;const head=element('div','section-heading');head.append(element('h3','',p.name),element('span','pill',card.id===session().characterId?'当前角色':`${card.enabledWorldbookIds.length} 本世界书`));
    row.append(head,element('p','about-prose',p.description?.slice(0,140) || '尚未填写角色描述。'),element('small','about-prose',`${p.compat?.mvu?'MVU 已开启':'MVU 未开启'} · ${p.compat?.ejs?'EJS 模板已开启':'EJS 模板未开启'} · ${p.helperScripts?.length || 0} 个脚本`),
      actions(button('用这张卡开新故事',()=>startCardStory(card)),button('编辑与世界书绑定',()=>openCardSettings(card.id)),button('导出角色卡',()=>{
        const raw=structuredClone(p.rawCard || {spec:'chara_card_v2',spec_version:'2.0',data:{}}),d=raw.data || raw;
        Object.assign(d,{name:p.name,description:p.description,personality:p.personality,scenario:p.scenario,first_mes:p.firstMessage,mes_example:p.examples});
        d.extensions ||= {};d.extensions.regex_scripts=p.regexes || [];d.extensions.tavern_helper ||= {};d.extensions.tavern_helper.scripts=p.helperScripts || [];
        d.character_book={...(d.character_book || {}),name:p.name+' · 已启用世界书',entries:state.library.worldbooks.filter(b=>card.enabledWorldbookIds.includes(b.id)).flatMap(b=>b.entries)};
        download(p.name+'.json',JSON.stringify(raw,null,2),'application/json');
      },'text-button')));list.append(row);
  }
}
function openCardSettings(id){
  const card=state.library.characters.find(c=>c.id===id);if(!card)return;const draft=structuredClone(card),p=draft.profile;
  const body=openModal('角色设置 · '+p.name,'card-settings'),grid=element('div','form-grid'),fields={};
  for(const [k,label,kind,full] of [['name','角色名','text',false],['userName','玩家名','text',false],['description','角色描述','textarea',true],['personality','角色性格','textarea',true],['scenario','场景','textarea',true],['persona','玩家资料','textarea',true],['firstMessage','开场白','textarea',true],['examples','对话示例','textarea',true]]){fields[k]=field(label,p[k],kind,full);grid.append(fields[k].wrap);}body.append(grid);
  body.append(element('h3','library-heading','为这张卡启用世界书'));
  body.append(element('p','about-prose','只勾选这张卡要用的书，不会自动给其他角色启用。修改后对该卡后续请求生效，已有消息的变量快照保留。'));
  const selected=new Set(draft.enabledWorldbookIds);
  for(const b of state.library.worldbooks){const c=check(`${b.name}（${b.entries.length} 条）`,selected.has(b.id));c.wrap.classList.add('book-binding');c.input.onchange=()=>{if(c.input.checked){selected.add(b.id);if(b.entries.some(e=>/\[initvar\]/i.test(e.name)))mvu.input.checked=true;if(b.entries.some(e=>e.content.includes('<%')))ejs.input.checked=true;}else selected.delete(b.id);};body.append(c.wrap);}
  if(!state.library.worldbooks.length)body.append(notice('总库还是空的。先到“世界书总库”创建或导入。'));
  body.append(element('h3','library-heading','运行框架'));
  const mvu=check('运行 MVU：InitVar 初始化、更新指令、每条消息变量快照',p.compat?.mvu),ejs=check('运行提示词模板：EJS 条件、循环、getvar / setvar',p.compat?.ejs),html=check('显示角色卡的 HTML 状态栏',p.compat?.cardHtml!==false);
  for(const c of [mvu,ejs,html]){c.wrap.classList.add('book-binding');body.append(c.wrap);}
  const scripts=field('卡片脚本 JSON（原有内容保留，可启用/停用）',JSON.stringify(p.helperScripts || [],null,2),'textarea',true,'MVU 核心与 mvu_zod 已本地化；已知模块引用会映射到本地，未知远程依赖会显示具体错误。'),regexes=field('角色卡显示正则 JSON',JSON.stringify(p.regexes || [],null,2),'textarea',true);
  const advanced=element('details','message-extra');advanced.append(element('summary','','查看 / 编辑卡片脚本与正则'),scripts.wrap,regexes.wrap);body.append(advanced);
  const result=element('div','about-prose');body.append(actions(button('保存角色与选书',async()=>{try{
    for(const [k,v] of Object.entries(fields))p[k]=v.input.value;
    p.compat={mvu:mvu.input.checked,ejs:ejs.input.checked,cardHtml:html.input.checked};p.helperScripts=JSON.parse(scripts.input.value);p.regexes=JSON.parse(regexes.input.value);
    if(!Array.isArray(p.helperScripts)||!Array.isArray(p.regexes))throw Error('脚本与正则 JSON 应是数组。');
    draft.enabledWorldbookIds=[...selected];Object.assign(card,draft);syncCard(card);await persist(true);render();openCharacters();toast('角色与世界书绑定已保存。');
  }catch(e){result.textContent=e.message;}},'primary'),button('返回角色库',openCharacters)),result);
}
function openWorldbooks(searchText=''){
  const body=openModal('世界书总库','worldbooks');body.append(notice('世界书在这里统一保存和编辑。每张角色卡在“角色卡库 → 编辑与世界书绑定”中自行勾选。导入到总库，不等于给所有角色启用。'));
  const controls=element('div','preset-controls'),search=element('input');search.type='search';search.placeholder='搜索世界书或条目…';search.value=searchText;
  controls.append(search,button('导入 JSON',()=>$('#library-book-file').click(),'primary'),button('新建世界书',()=>editWorldbook({id:uid(),name:'新世界书',entries:[],source:'用户创建',createdAt:Date.now(),updatedAt:Date.now()},true)));body.append(controls);
  const list=element('div','library-list');body.append(list);
  const draw=()=>{list.replaceChildren();for(const b of state.library.worldbooks.filter(b=>(b.name+' '+b.entries.map(e=>e.name).join(' ')).toLowerCase().includes(search.value.toLowerCase()))){
    const row=element('section','library-card'),bound=state.library.characters.filter(c=>c.enabledWorldbookIds.includes(b.id));
    const h=element('div','section-heading');h.append(element('h3','',b.name),element('span','pill',b.entries.length+' 条'));row.append(h,element('p','about-prose',bound.length?'已绑定：'+bound.map(c=>c.name).join('、'):'尚未绑定角色'),
      actions(button('编辑条目',()=>editWorldbook(b)),button('导出',()=>download(b.name+'.json',JSON.stringify({name:b.name,entries:Object.fromEntries(b.entries.map((e,i)=>[i,{...e,uid:i,key:e.keys,keysecondary:e.secondary,comment:e.name,disable:!e.enabled,position:e.originalPosition}]))},null,2),'application/json')),button('删除',()=>confirmAction('删除世界书？',`将从总库移除「${b.name}」，并解除 ${bound.length} 张卡的绑定。已保存消息不受影响。`,()=>{state.library.worldbooks=state.library.worldbooks.filter(v=>v.id!==b.id);for(const c of bound)c.enabledWorldbookIds=c.enabledWorldbookIds.filter(id=>id!==b.id);persist();updateLibraryBadges();openWorldbooks();}),'text-button')));list.append(row);
  }if(!list.childElementCount)list.append(element('div','empty','总库中还没有世界书。可以导入独立世界书 JSON，或导入带内置世界书的角色卡。'));};search.oninput=draw;draw();
}
function editWorldbook(book,isNew=false){
  const draft=structuredClone(book),body=openModal('编辑世界书','book-edit'),name=field('世界书名称',draft.name);body.append(name.wrap);
  const list=element('div');body.append(list);
  function draw(){list.replaceChildren();for(const [index,row] of draft.entries.entries()){
    const details=element('details','entry-editor');if(draft.entries.length<4)details.open=true;details.append(element('summary','',row.name || '新条目'));
    const grid=element('div','form-grid'),title=field('条目标题',row.name),keys=field('触发关键词（逗号分隔）',(row.keys || []).join(', ')),secondary=field('辅助关键词',(row.secondary || []).join(', ')),order=field('插入顺序',row.order ?? 100,'number'),content=field('条目正文 / EJS 模板 / InitVar YAML',row.content,'textarea',true);
    const pos=selectField('插入位置',String(row.originalPosition ?? 0),[['0','角色资料之前'],['1','角色资料之后'],['4','聊天深度位置']]),depth=field('深度（位置为深度时生效）',row.depth ?? 4,'number');
    for(const f of [title,keys,secondary,order,pos,depth,content])grid.append(f.wrap);details.append(grid);
    const enabled=check('启用条目',row.enabled!==false),constant=check('常驻（忽略关键词）',row.constant),selective=check('同时匹配辅助关键词',row.selective);
    details.append(actions(enabled.wrap,constant.wrap,selective.wrap,button('移除此条',()=>{draft.entries.splice(index,1);draw();},'text-button')));
    title.input.oninput=()=>{row.name=title.input.value;details.querySelector('summary').textContent=row.name;};keys.input.oninput=()=>row.keys=keys.input.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean);secondary.input.oninput=()=>row.secondary=secondary.input.value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean);
    content.input.oninput=()=>row.content=content.input.value;order.input.oninput=()=>row.order=Number(order.input.value);pos.input.onchange=()=>{row.originalPosition=Number(pos.input.value);row.position=row.originalPosition===1?'after':'before';};depth.input.oninput=()=>row.depth=Number(depth.input.value);
    enabled.input.onchange=()=>row.enabled=enabled.input.checked;constant.input.onchange=()=>row.constant=constant.input.checked;selective.input.onchange=()=>row.selective=selective.input.checked;list.append(details);
  }}draw();
  body.append(actions(button('新增条目',()=>{draft.entries.push({id:uid(),name:'新条目',content:'',keys:[],secondary:[],enabled:true,constant:true,order:100,originalPosition:0,depth:4,position:'before'});draw();}),
    button('保存世界书',async()=>{draft.name=name.input.value.trim()||'未命名世界书';draft.updatedAt=Date.now();if(isNew)state.library.worldbooks.push(draft);else Object.assign(book,draft);await persist(true);updateLibraryBadges();openWorldbooks();toast('世界书已保存，绑定它的角色会共用这份内容。');},'primary'),button('返回',openWorldbooks)));
}
async function openVariables(){
  const body=openModal('当前故事 · 变量与运行','variables');body.append(notice('变量归当前故事所有，不会与同卡的其他故事混用。下方读取最近一条已完成消息的快照；尚未开局时显示 InitVar 初始化结果。查看不调用模型。'));
  const area=element('div','about-prose','正在读取本地框架状态…');body.append(area);
  try{const result=await api('runtime/inspect',{state}),last=session().messages.findLast(m=>m.role==='assistant'&&m.runtime),stats=element('div','stats');
    for(const [value,label] of [[result.compat.mvu?'开启':'关闭','MVU'],[result.compat.ejs?'开启':'关闭','EJS 提示词模板'],[result.schemaRegistered?'已注册':'未注册','Zod 变量结构'],[result.books.length,'启用世界书']]){const stat=element('div','stat');stat.append(element('strong','',value),document.createTextNode(label));stats.append(stat);}area.replaceChildren(stats);
    const current=last?.runtime.after || result.current || {stat_data:{}};area.append(element('h3','','当前 stat_data'),element('pre','code-view',JSON.stringify(current.stat_data || {},null,2)));
    const errors=[...(result.errors || []),...(last?.runtime.errors || [])],warnings=[...(result.warnings || []),...(last?.runtime.warnings || [])];if(errors.length)area.append(notice('更新错误：\n'+errors.join('\n')));if(warnings.length)area.append(notice('运行提示：\n'+warnings.join('\n')));
    area.append(element('p','about-prose','已选世界书：'+result.books.map(b=>`${b.name}（${b.entries} 条）`).join('、')));
    const edit=field('手动编辑当前 stat_data（JSON）',JSON.stringify(current.stat_data || {},null,2),'textarea',true,'提交时通过当前卡的 MVU/Zod 规则计算。已有消息会保留更新前后的快照。');area.append(edit.wrap);
    area.append(actions(button('提交变量修改',async()=>{try{const value=JSON.parse(edit.input.value),reply=await api('runtime/parse',{state,old:current,text:'<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:'',value}])+'</JSONPatch></UpdateVariable>'});if(reply.errors.length)throw Error(reply.errors.join('\n'));const m=session().messages.findLast(m=>m.role==='assistant');if(m)m.runtime={...(m.runtime || {}),after:reply.current};else session().runtime={...(session().runtime || {}),initial:reply.current};await persist(true);openVariables();toast('变量已按当前规则更新。');}catch(e){toast(e.message);}},'primary'),button('按当前资料重算本故事',()=>confirmAction('重新计算本故事变量？','仅重算当前故事，保留消息原文。已有变量快照会按当前选书、脚本与规则重新生成；不调用模型。',async()=>{try{const r=await api('runtime/recalculate',{state,fromIndex:0});state=r.state;render();openVariables();toast('本故事的变量与显示结果已重算。');}catch(e){toast(e.message);}}))));
  }catch(e){area.textContent=e.message;}
}
function cardFrame(html,message){
  const frame=element('iframe','card-frame');frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('title','角色卡界面');frame.height='260';frame.setAttribute('loading','lazy');
  const s=session(),index=s.messages.findIndex(m=>m.id===message.id),seed={messageId:index,current:message.runtime?.after || {stat_data:{}},localVariables:message.runtime?.localVariables || {},globalVariables:state.library.globalVariables || {},messages:s.messages.map(m=>({id:m.id,role:m.role,content:m.content,data:m.runtime?.after || {}}))};
  api('card-frame',{html,seed}).then(data=>{if(!frame.isConnected)return;frame.src=data.url;frameRegistry.set(data.nonce,{frame,sessionId:s.id,messageId:message.id});for(const [k,v] of frameRegistry)if(!v.frame.isConnected)frameRegistry.delete(k);}).catch(e=>{frame.replaceWith(element('div','notice','卡片界面加载出错：'+e.message));});return frame;
}
function splitCardDisplay(raw){
  const blocks=[];let text=String(raw).replace(/```(?:html)?\s*\n([\s\S]*?)```/gi,(all,body)=>{if(!/<(?:html|style|script|div|section|table)\b/i.test(body))return all;blocks.push(body);return '';});
  if(/<(?:html|style|script|div|section|table)\b/i.test(text)){blocks.push(text);text='';}return {text:text.replace(/<StatusPlaceHolderImpl\s*\/>/gi,''),blocks};
}
window.addEventListener('message',async event=>{
  const data=event.data;if(!data?.meowFrame)return;const reg=frameRegistry.get(data.nonce);if(!reg || event.source!==reg.frame.contentWindow)return;
  if(data.type==='resize'){reg.frame.height=String(Math.max(100,Math.min(2000,Number(data.height)||260)));return;}
  if(data.type==='error'){toast('卡片界面：'+data.error);return;}
  if(data.type!=='request')return;
  const respond=(value,error)=>reg.frame.contentWindow?.postMessage({meowFrame:true,nonce:data.nonce,type:'response',id:data.id,value,error},'*');
  try{
    if(busy)throw Error('生成期间先保留当前状态，完成后再修改变量。');
    const story=state.sessions.find(s=>s.id===reg.sessionId),message=story?.messages.find(m=>m.id===reg.messageId);if(!message || story.id!==state.activeId)throw Error('这条卡片界面已离开当前故事。');
    if(data.action==='parse'){const r=await api('runtime/parse',{state,old:data.old,text:data.text});if(r.errors.length)throw Error(r.errors.join('\n'));return respond(r.current);}
    if(data.action==='replace'){
      const reply=await api('runtime/parse',{state,old:message.runtime?.after || {stat_data:{}},text:'<UpdateVariable><JSONPatch>'+JSON.stringify([{op:'replace',path:'',value:data.value?.stat_data || {}}])+'</JSONPatch></UpdateVariable>'});
      if(reply.errors.length)throw Error(reply.errors.join('\n'));message.runtime={...(message.runtime || {}),after:reply.current};await persist(true);return respond(true);
    }throw Error('未识别的卡片状态操作。');
  }catch(e){respond(null,e.message);}
});
function bindLibrary(){
  $('#open-characters').onclick=openCharacters;$('#open-worldbooks').onclick=()=>openWorldbooks();$('#open-variables').onclick=openVariables;
  const input=element('input');input.type='file';input.accept='.json';input.multiple=true;input.id='library-book-file';input.hidden=true;document.body.append(input);
  input.onchange=async()=>{try{let count=0;for(const file of input.files){const result=await api('library/import-worldbook',{name:file.name.replace(/\.json$/i,''),json:JSON.parse(await file.text())});state.library.worldbooks.push(result.worldbook);count++;}await persist(true);updateLibraryBadges();openWorldbooks();toast(`已导入 ${count} 本世界书，尚未自动绑定其他角色。`);}catch(e){toast(e.message);}finally{input.value='';}};
}
