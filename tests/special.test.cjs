'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Data=require('../app/public/special-data.js'),Edition=require('../app/core/special-edition.cjs'),Undo=require('../app/core/generation-undo.cjs'),E=require('../app/core/engine.cjs');
test('special reader separates story from every auxiliary block and status loader',()=>{
  const message={content:'<think_nya>附带思考</think_nya><game>第一段。\n\n**第二段。**</game><summary>场记。</summary><comment>旁白。</comment><background>背景。</background><options><option>向左。</option><option>向右。</option></options><must>格式要求</must><UpdateVariable><Analysis>更新分析</Analysis><JSONPatch>[]</JSONPatch></UpdateVariable><StatusPlaceHolderImpl/>'};
  assert.deepEqual(Data.parse(message),{story:'第一段。\n\n**第二段。**',thought:'附带思考',summary:'场记。',comment:'旁白。',background:'背景。',options:['向左。','向右。']});
  assert.equal(Data.parse({...message,renderedContent:message.content,displayContent:'```html\n<script>atob("fixture")</script>\n```'}).story,'第一段。\n\n**第二段。**');
  assert.equal(Data.parse('<game>流式半段',true).story,'流式半段');assert.equal(Data.parse('<think_nya>还没有正文',true).story,'');
  assert.equal(Data.parse('普通开场。<StatusPlaceHolderImpl/>').story,'普通开场。');
});
test('catalog contains only theater stories, and derives titles from structured event summaries',()=>{
  const s={messages:[{id:'a0',role:'assistant',content:'开场。'},{id:'u1',role:'user',content:'原输入'},{id:'a1',role:'assistant',mode:'theater',content:'<game>正文一。</game><summary>【高密度剧本场记状态卡】\n- 【时空与在场】：清晨，餐厅。\n- 【本轮事件链】：大家来到餐厅；准备出发。\n- 【定格与伏笔】：等待决定。</summary>'},{id:'uc',role:'user',mode:'chat',content:'讨论问题'},{id:'ac',role:'assistant',mode:'chat',content:'场外回答'},{id:'empty',role:'assistant',content:'<think_nya>只有附带文本</think_nya>'}]};
  const rows=Data.layers(s);assert.deepEqual(rows.map(x=>[x.id,x.label,x.title]),[['a0','开场','故事开场'],['a1','第 1 层','大家来到餐厅']]);assert.equal(rows[1].introduction,'大家来到餐厅；准备出发。');
  const record=Data.record(s,rows[1]);assert.equal(record.user.id,'u1');assert.deepEqual(record.chats.map(x=>x.id),['uc','ac']);
  s.messages[2].turnContext={userMessageId:'u1',directorNote:'本轮便笺'};assert.equal(Data.record(s,Data.layers(s)[1]).note,'本轮便笺');
});
test('special edition is explicitly enabled and only binds a matching original UI',()=>{
  const profile={regexes:[{scriptName:'[界面]绯月立绘互动状态栏',replaceString:'fixture'}],helperScripts:[{name:'绯月UI · 作者配置',enabled:true}]},state={activeId:'s',sessions:[{id:'s',characterId:'c'}],library:{characters:[{id:'c',profile}]}};
  assert.equal(Edition.info('',state),null);assert.equal(Edition.info('seraphina',state).cardId,'c');assert.equal(Data.matches({...profile,regexes:[]}),false);assert.equal(Data.matches({...profile,helperScripts:[]}),false);
});
test('turn input metadata and special view survive normalization and exact single-step undo',()=>{
  const state=E.defaultState(),s=state.sessions[0];s.messages=[{id:'u',role:'user',content:'原输入'},{id:'a',role:'assistant',content:'<game>正文</game>',turnContext:{userMessageId:'u',directorNote:'便笺',deepThink:true,mode:'theater'}}];
  const normalized=E.normalizeState(state);assert.deepEqual(normalized.sessions[0].messages[1].turnContext,s.messages[1].turnContext);
  const point=Undo.capture(normalized,s.id,{draft:'  原输入  ',special:{page:'options',messageId:'a'}});assert.equal(Undo.validate(point),true);assert.deepEqual(point.view.special,{page:'options',messageId:'a'});
  const changed=structuredClone(normalized);changed.sessions[0].messages.push({id:'new',role:'assistant',content:'新一层'});assert.deepEqual(Undo.restore(changed,point),normalized);
});
