'use strict';
const Special=(()=>{
  let active=false,edition,storyId='',selectedId=null,page='story',following=false,generating=false,dock=null,dockKey='',portal=null,restorePosition=null;
  const positions=new Map(),pages=[['story','正文'],['thought','思考'],['summary','场记'],['comment','悄悄话'],['options','选项'],['background','背景'],['record','本层记录']];
  const rows=()=>SpecialData.layers(session()),latest=()=>rows().at(-1),chosen=()=>rows().find(x=>x.id===selectedId)||latest();
  const history=()=>active&&!following&&!!chosen()&&chosen().id!==latest()?.id;
  const card=()=>state.library.characters.find(c=>c.id===edition?.cardId)||state.library.characters.find(c=>SpecialData.matches(c.profile))||currentCard();
  function acceptStory(s){return SpecialData.matches(s?.profile);}
  function ensureState(){
    if(!active||acceptStory(session()))return;
    const s=[...state.sessions].filter(acceptStory).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
    if(s){state.activeId=s.id;$('#message-input').value=chatDrafts.get(s.id)||'';return;}
    const c=card();if(c&&SpecialData.matches(c.profile))newStory(c.profile,c.id,false);
  }
  function initialize(bootstrap){
    if(bootstrap.edition?.id!=='seraphina')return;active=true;edition=bootstrap.edition;
    const css=element('link');css.rel='stylesheet';css.href='/special.css';document.head.append(css);document.body.classList.add('special-edition');document.title='Meowssiah · 绯月专属版';
    const aside=element('aside','special-character');aside.setAttribute('aria-label','角色与功能');aside.innerHTML='<div class="special-character-head"><h2>绯月 · 角色界面</h2><span>专属工作台</span></div><div id="special-character-body"></div><div class="special-character-foot"><span id="special-character-floor">当前状态</span><span id="special-save-status">本机存档</span></div>';
    $('.app-shell').insertBefore(aside,$('.main'));
    const head=element('div','special-reader-head');head.innerHTML='<div class="special-chapter-heading"><button id="special-catalog" class="special-catalog-button">☷ 故事目录</button><div><small id="special-layer-number"></small><h1 id="special-chapter-title"></h1></div></div><nav class="special-layer-navigation" aria-label="故事楼层"><button id="special-previous">← 上一层</button><button id="special-next">下一层 →</button><button id="special-latest">回到最新</button></nav>';
    $('.topbar').append(head);
    const tabs=element('nav','special-page-tabs');tabs.setAttribute('aria-label','本层内容');tabs.setAttribute('role','tablist');for(const [key,label]of pages){const b=button(label,()=>selectPage(key),'');b.dataset.page=key;b.setAttribute('role','tab');tabs.append(b);}$('.chat-column').prepend(tabs);
    const banner=element('div','special-history-banner');banner.id='special-history-banner';banner.hidden=true;banner.append(element('span','','正在查看旧楼层 · 这里只阅读，不改写当前进度'),button('回到最新继续写',goLatest,''));$('.composer-area').before(banner);
    const grid=element('div','special-compose-grid'),composer=$('#composer'),director=element('div','special-director-card'),label=$('#note-auto-clear').closest('label');
    composer.prepend(element('label','special-input-label','你的下一步'));director.append(element('div','special-director-title','✎ 导演台'),$('#director-note'),label);label.className='special-clear-note';label.lastChild.textContent='成功后清空';
    grid.append(composer,director);$('.composer-area').append(grid);
    const auto=$('#chat-auto-return').closest('label');auto.title='场外聊天完成后自动回到剧场';auto.lastChild.textContent='聊完回剧场';$('.composer-tools').insertBefore(auto,$('#composer-model'));
    const tools=element('div','special-compose-actions');$('#retry-message').textContent='↻ 重生成';$('#undo-generation').textContent='↶ 撤回本轮';tools.append($('#retry-message'),$('#undo-generation'));$('.composer-tools').append(tools);
    const dialog=element('dialog');dialog.id='special-card-presentation';dialog.innerHTML='<div class="special-presentation-head"><h2 id="special-presentation-title">角色界面</h2><button id="special-presentation-close" class="icon-button" aria-label="关闭角色界面">×</button></div><div id="special-card-presentation-body"></div>';document.body.append(dialog);
    $('#special-presentation-close').onclick=requestClose;dialog.addEventListener('cancel',e=>{e.preventDefault();requestClose();});dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)requestClose();}});
    $('#special-catalog').onclick=catalog;$('#special-previous').onclick=()=>step(-1);$('#special-next').onclick=()=>step(1);$('#special-latest').onclick=goLatest;
    $('#new-story').onclick=()=>startCardStory(card());$('.brand').removeAttribute('href');$('.brand').title='绯月专属版 1.0.0';$('#open-about').title='专属版说明';
    for(const b of $$('.sidebar .nav-button'))b.title=b.textContent.trim();
    $('#open-about').onclick=()=>{const b=openModal('绯月专属版 · 1.0.0');b.append(element('p','about-prose','左侧保留这张卡的六个原生入口。正文每次只显示一个故事楼层，思考、场记、悄悄话和选项分别查看。旧层只读；目录切换不回退实际进度。'),element('p','about-prose','导演台与输入并排。本层记录保存原输入、导演便笺与场外聊天。选项先填入输入框，确认后再发送。'),element('p','about-prose','原预设请求重写、同轮 MVU、上下文滚动、记住密钥与单步撤回继续沿用。专属数据与通用版分开保存。'),element('p','about-prose','本机数据目录：'+dataDir),button('原预设与迁移说明',openAbout));};
    new MutationObserver(()=>{const e=$('#special-save-status');if(e)e.textContent=$('#save-status').textContent;}).observe($('#save-status'),{childList:true,characterData:true,subtree:true});
    ensureState();
  }
  function savePosition(){if(storyId)positions.set(storyId+':'+(selectedId||'latest')+':'+page,$('#chat-scroll').scrollTop);}
  function selectPage(value){if(!pages.some(([key])=>key===value))return;savePosition();page=value;restorePosition=positions.get(storyId+':'+(selectedId||'latest')+':'+page)||0;renderMessages();}
  function selectLayer(id){savePosition();following=false;selectedId=id;restorePosition=positions.get(storyId+':'+selectedId+':'+page)||0;renderMessages();}
  function step(delta){const list=rows(),index=list.findIndex(x=>x.id===chosen()?.id);if(list[index+delta])selectLayer(list[index+delta].id);}
  function goLatest(){selectLayer(latest()?.id||null);}
  function catalog(){const body=openModal('故事目录 · 切换楼层只查看','special-catalog'),list=element('div','special-catalog-list');for(const row of rows()){
    const b=button('',()=>{closeModal();selectLayer(row.id);},'special-catalog-item');b.dataset.storyLayer=row.id;b.setAttribute('aria-current',String(row.id===chosen()?.id));b.append(element('strong','',row.label+' · '+row.title),element('small','',row.id===latest()?.id?'最新故事':''),element('p','',row.introduction));list.append(b);
  }body.append(list);if(!list.childElementCount)body.append(notice('开场白加载后会出现在这里。'));}
  function section(title,text){const box=element('section','special-meta-section');box.append(element('h3','',title),rich(text));return box;}
  function records(target,row){
    const record=SpecialData.record(session(),row);target.append(section('你发送的原输入',record.user?.content||'这一层是开场白。'),section('本轮导演便笺',record.note||(row?.message.turnContext?'本轮没有导演便笺。':row?.opening?'开场白没有导演便笺。':'旧存档未保留当轮导演便笺。')));
    const tools=element('div','special-record-actions');if(record.user&&!history()&&!busy)tools.append(button('编辑本轮原输入',()=>editMessage(session().messages.find(m=>m.id===record.user.id))));
    if(row&&!history()&&!busy)tools.append(button('编辑本轮回复原文',()=>editMessage(session().messages.find(m=>m.id===row.id))));
    if(row)tools.append(button('复制本轮原文',()=>navigator.clipboard.writeText(row.message.content).then(()=>toast('已复制原文'))));target.append(tools);
    for(const m of record.chats)target.append(section(m.role==='user'?'场外 · 你的消息':'场外 · 小猫回复',m.role==='assistant'?SpecialData.parse(m).story:m.content));
    for(const m of record.attempts)target.append(section(m.role==='user'?'尚未完成的下一轮 · 原输入':'尚未完成的回复',m.role==='user'?m.content:SpecialData.parse(m).story||'这轮没有收到正文，可重试或撤回。'));
    if(row?.message.runtime?.errors?.length)target.append(section('变量更新记录',row.message.runtime.errors.join('\n')));
    if(row?.message.usage?.total_tokens)target.append(element('p','special-muted',row.message.usage.total_tokens+' tokens'));
  }
  function renderMessages(){
    const s=session();if(storyId!==s.id){forceClose();storyId=s.id;selectedId=null;page='story';following=false;positions.clear();restorePosition=0;}
    const list=rows(),last=list.at(-1);if(!list.some(x=>x.id===selectedId))selectedId=last?.id||null;
    if(!busy&&following){selectedId=last?.id||null;following=false;restorePosition=0;}
    let row=list.find(x=>x.id===selectedId)||last,isLive=busy&&generating&&!!liveMessageId&&following&&s.mode!=='chat';
    if(isLive){const message={id:liveMessageId,role:'assistant',content:liveText,mode:'theater',status:'streaming'};row={id:message.id,message,index:s.messages.length,label:'正在续写',title:'下一幕',parts:SpecialData.parse(message,true)};}
    $('#special-layer-number').textContent=row?.label||'故事待开始';$('#special-chapter-title').textContent=row?.title||s.profile.name;$('#special-chapter-title').title=s.title;
    const index=list.findIndex(x=>x.id===selectedId);$('#special-previous').disabled=index<=0;$('#special-next').disabled=index<0||index>=list.length-1;$('#special-latest').disabled=!history()&&!isLive;
    for(const b of $$('.special-page-tabs button')){b.setAttribute('aria-selected',String(b.dataset.page===page));b.tabIndex=b.dataset.page===page?0:-1;b.onclick=()=>selectPage(b.dataset.page);b.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const n=pages.findIndex(([k])=>k===page);selectPage(pages[(n+(e.key==='ArrowRight'?1:pages.length-1))%pages.length][0]);$('.special-page-tabs [aria-selected=true]').focus();}};}
    const record=page==='record'?SpecialData.record(s,row):null,recordKey=record?{user:record.user?.content,note:record.note,chats:record.chats.map(m=>[m.id,m.content,m.renderedContent]),attempts:record.attempts.map(m=>[m.id,m.content])}:null;
    const host=$('#messages'),key=JSON.stringify([s.id,row?.id,row?.parts,page,history(),busy,recordKey,row?.message.status]);
    if(host._specialKey!==key){const node=element('article',page==='story'?'special-story-body':'special-meta-page');node.dataset.id=row?.id||'';node.dataset.storyLayer=row?.id||'';node.dataset.page=page;
      if(page!=='story')node.append(element('h2','',pages.find(([k])=>k===page)[1]));
      if(page==='record')records(node,isLive?null:row);
      else if(page==='options'){const options=element('div','special-options');for(const text of row?.parts.options||[]){const b=button(text,()=>{if(history()||busy)return;$('#message-input').value=text;chatDrafts.set(s.id,text);fitComposer();$('#message-input').focus();toast('选项已填入，可修改后发送。');},'');b.disabled=history()||busy;options.append(b);}node.append(options);if(!options.childElementCount)node.append(element('p','special-muted','这一层没有附带选项。'));}
      else {const text=row?.parts[page];if(text)node.append(rich(text));else node.append(element('p','special-muted',isLive?'小猫正在写下一幕…':row?'这一层没有附带这项内容。':'正在加载这张卡的故事…'));}
      if(row?.message.status==='stopped'||row?.message.status==='error')node.append(element('p','special-muted',row.message.status==='stopped'?'本轮已停止，保留收到的内容。':'本轮响应中断，保留收到的内容。'));
      host.replaceChildren(node);host._specialKey=key;
    }
    syncDock(history()?row?.message:s.messages.findLast(m=>m.role==='assistant')||row?.message);
    $('#special-character-floor').textContent=history()?(row?.label+' · 历史快照，只读'):'当前状态';$('#special-history-banner').hidden=!history();updateComposerActions();
    if(restorePosition!==null){$('#chat-scroll').scrollTop=restorePosition;restorePosition=null;}releaseDisconnectedCardFrames();syncCardFrameContext();
  }
  function syncDock(message){const key=message?session().id+':'+message.id:'';if(dock&&key===dockKey&&dock.isConnected)return;forceClose();dock?.remove();dock=null;dockKey=key;const body=$('#special-character-body');body.replaceChildren();
    if(!message){body.append(element('p','special-muted','等待角色初始化…'));return;}const html=SpecialData.uiHtml(session().profile);if(!html){body.append(notice('请导入对应的角色卡后使用专属界面。'));return;}
    dock=cardFrame(html,message,{surface:'special-dock',readOnly:history()});body.append(dock);
  }
  function presentation(reg,data){if(!active||reg.frame!==dock)return;if(!data.open){forceClose();return;}const dialog=$('#special-card-presentation');$('#special-presentation-title').textContent=data.title||'角色界面';
    if(!portal){const placeholder=element('div');placeholder.style.height='100%';dock.before(placeholder);portal={placeholder,focus:document.activeElement};dialog.showModal();$('#special-card-presentation-body').moveBefore(dock,null);}dialog.dataset.kind=data.kind;
  }
  function requestClose(){for(const [nonce,reg]of frameRegistry)if(reg.frame===dock)reg.frame.contentWindow?.postMessage({meowFrame:true,nonce,type:'presentation-close'},'*');}
  function forceClose(){if(!portal)return;const {placeholder,focus}=portal;portal=null;const home=placeholder.parentNode;if(home?.isConnected&&dock?.isConnected)home.moveBefore(dock,placeholder);placeholder.remove();$('#special-card-presentation')?.close();if(focus?.isConnected)focus.focus({preventScroll:true});}
  function maskComposer(){if(!active)return;const readOnly=history();for(const id of ['message-input','director-note','send-message','retry-message','deep-think','note-auto-clear','chat-auto-return','mode-theater','mode-chat'])$('#'+id).disabled=busy||readOnly;$('#undo-generation').disabled=busy||readOnly||!undoPoint||undoPoint.storyId!==state.activeId;}
  function busyChanged(value,kind){if(!active)return;if(value&&kind==='generation'&&!generating){generating=true;following=true;page=session().mode==='chat'?'record':'story';restorePosition=0;}if(!value)generating=false;maskComposer();syncCardFrameContext();}
  function captureView(){return {page,messageId:selectedId};}
  function restoreView(view){if(!active)return;forceClose();storyId=session().id;page=pages.some(([k])=>k===view?.page)?view.page:'story';selectedId=view?.messageId||null;following=false;generating=false;}
  return {get active(){return active;},initialize,ensureState,acceptStory,card,renderMessages,history,maskComposer,busyChanged,captureView,restoreView,presentation,forceClose};
})();
