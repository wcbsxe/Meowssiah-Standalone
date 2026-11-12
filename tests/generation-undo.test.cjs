'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const E=require('../app/core/engine.cjs'),{Store}=require('../app/core/store.cjs');
function setup(){
  fs.mkdirSync(path.join(__dirname,'../evidence'),{recursive:true});
  const dir=fs.mkdtempSync(path.join(__dirname,'../evidence/undo-unit-')),store=new Store(dir),s=store.snapshot();
  const chat=s.sessions[0],card=s.library.characters[0];chat.id='undo-story';s.activeId=chat.id;chat.title='书店';chat.mode='chat';chat.note='本轮便笺';chat.deepThink=true;
  chat.hostMetadata={archive:{kept:'before-ledger'}};chat.runtime={initial:{stat_data:{好感度:10}},localVariables:{scene:'before'}};
  chat.messages=[{id:'opening',role:'assistant',content:'<game>在书店里喝茶。</game>',timestamp:1000,mode:'theater',status:'complete',extra:{ledger:'before'},runtime:{before:{stat_data:{好感度:10}},after:{stat_data:{好感度:10}},localVariables:{scene:'before'},errors:[]}}];
  card.variables={wardrobe:{coat:'灰色'},counter:3};s.library.globalVariables={weather:'雨',counter:8};store.save(s);return {dir,store};
}
function changed(store){const s=store.snapshot(),chat=s.sessions[0];chat.messages[0].extra={ledger:'after'};chat.messages.push({id:'sent',role:'user',content:'撤回检查输入',timestamp:2000,status:'complete'},{id:'reply',role:'assistant',content:'临时回复仅用于回撤检查',timestamp:3000,status:'complete',runtime:{after:{stat_data:{好感度:99}},localVariables:{scene:'after'}}});chat.hostMetadata={archive:{kept:'after-ledger'}};chat.note='';chat.mode='theater';chat.title='被改动的标题';chat.updatedAt=9999;s.library.characters[0].variables={wardrobe:{coat:'蓝色'},counter:12};s.library.globalVariables={weather:'晴',counter:22};return store.save(s);}
function domain(s){const n=structuredClone(s);delete n.revision;return n;}
test('one persisted checkpoint restores every generation-owned field exactly, without replaying MVU',()=>{
  const {store}=setup(),before=store.snapshot(),view={draft:'  原输入\n保留空白  ',windowEnd:1,anchor:{storyId:'undo-story',messageId:'opening',offset:-12,windowEnd:1},scrollTop:25,followLatest:false,diagnostics:{characters:123}};
  const point=store.captureUndo('undo-story',view);changed(store);const r=store.restoreUndo(point.id,'undo-story');assert.deepEqual(domain(r.state),domain(before));assert.deepEqual(r.view,view);assert.equal(store.undoInfo(),null);assert.equal(fs.existsSync(store.undoFile),false);
  assert.deepEqual(domain(JSON.parse(fs.readFileSync(store.previous,'utf8'))),domain(before));assert.ok(!fs.readFileSync(store.previous,'utf8').includes('临时回复仅用于回撤检查'));
  assert.throws(()=>store.restoreUndo(point.id,'undo-story'),/没有对应/);
});
test('new attempts overwrite one global checkpoint, never nest snapshots, and survive cold restart',()=>{
  const {dir,store}=setup();let latest,before;
  for(let i=0;i<30;i++){before=store.snapshot();latest=store.captureUndo('undo-story',{draft:'输入 '+i},i%2?'retry':'send');const saved=store.read(store.undoFile);assert.ok(!saved.story.undo&&!saved.undo&&!saved.state);assert.equal(fs.readdirSync(path.dirname(store.undoFile)).length,1);assert.ok(fs.statSync(store.undoFile).size<JSON.stringify(store.snapshot()).length*2+5000);const state=store.snapshot();state.sessions[0].note='第 '+i+' 轮后的便笺';state.library.globalVariables.counter=i+30;store.save(state);}
  const cold=new Store(dir);assert.equal(cold.undoInfo().id,latest.id);const r=cold.restoreUndo(latest.id,'undo-story');assert.deepEqual(domain(r.state),domain(before));assert.equal(r.view.draft,'输入 29');assert.equal(fs.readdirSync(path.dirname(cold.undoFile)).length,0);
});
test('interrupted restore completes from its same single checkpoint; invalid points do not alter the story',()=>{
  const {dir,store}=setup(),before=store.snapshot(),point=store.captureUndo('undo-story',{draft:'恢复中的输入'});changed(store);const saved=store.read(store.undoFile);store.atomic(store.undoFile,{...saved,status:'restoring'});
  const recovered=new Store(dir);assert.deepEqual(domain(recovered.snapshot()),domain(before));assert.equal(recovered.restoredUndoView.draft,'恢复中的输入');assert.equal(recovered.undoInfo(),null);assert.equal(fs.existsSync(recovered.undoFile),false);
  recovered.captureUndo('undo-story',{});const current=recovered.snapshot();fs.writeFileSync(recovered.undoFile,'{"version":1,"broken":true}');const invalid=new Store(dir);assert.deepEqual(domain(invalid.snapshot()),domain(current));assert.equal(invalid.undoInfo(),null);
});
test('undo is scoped to its chat and variable scopes; unrelated chats, connection and theme are retained',()=>{
  const {store}=setup(),before=store.snapshot(),point=store.captureUndo('undo-story',{});changed(store);const current=store.snapshot(),other=E.newSession();other.id='other-chat';other.title='另一个聊天';current.sessions.push(other);current.ui.theme='dark';store.save(current);store.saveConnection({...store.state.settings,baseUrl:'http://127.0.0.1:54321/v1',model:'local-model'});
  const r=store.restoreUndo(point.id,'undo-story');assert.deepEqual(r.state.sessions[0],before.sessions[0]);assert.deepEqual(r.state.sessions[1],E.normalizeState(current).sessions[1]);assert.equal(r.state.ui.theme,'dark');assert.equal(r.state.settings.model,'local-model');assert.deepEqual(r.state.library.characters[0].variables,before.library.characters[0].variables);assert.deepEqual(r.state.library.globalVariables,before.library.globalVariables);
  const p=store.captureUndo('undo-story',{}),edit=store.snapshot();edit.library.characters[0].profile.description='修改运行资料';store.save(edit);assert.equal(store.undoInfo(),null);assert.throws(()=>store.restoreUndo(p.id,'undo-story'),/没有对应/);
});
