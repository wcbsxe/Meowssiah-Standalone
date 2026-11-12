// Targeted checks for this change only. Does not invoke the old full test command.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const E=require('../app/core/engine.cjs'),L=require('../app/core/library.cjs'),R=require('../app/core/card-runtime.cjs'),{Store}=require('../app/core/store.cjs');
const {makeCard,makeBook}=require('./fixture-1.1.cjs');
(async()=>{
  let state=E.defaultState();const p=E.importCharacter(makeCard()),s=state.sessions[0];s.profile=p;s.characterId='';state=E.normalizeState({...state,library:{version:1,characters:[],worldbooks:[]}});
  const story=state.sessions[0],card=state.library.characters[0];assert.ok(card.profile.compat.mvu&&card.profile.compat.ejs);assert.equal(card.enabledWorldbookIds.length,1);
  const extra={id:'public-book',name:makeBook().name,entries:E.normalizeWorldbook(makeBook()),createdAt:Date.now()};state.library.worldbooks.push(extra);card.enabledWorldbookIds.push(extra.id);
  const other=E.newSession({name:'另一个角色'});state.sessions.push(other);state=E.normalizeState(state);assert.equal(L.selectedBooks(state,state.sessions[1]).length,0);
  const a=state.sessions[0];a.messages.push({id:'user-1',role:'user',content:'我走进书店。',status:'complete'});
  let prepared=await R.prepare(state,a,E.effectivePrompts(state));assert.equal(prepared.current.stat_data.好感度,10);assert.ok(prepared.schemaRegistered);assert.ok(prepared.books[0].entries[1].content.includes('刚刚见面'));
  const content='<game>店主递给你一杯热茶。</game><UpdateVariable><JSONPatch>[{"op":"replace","path":"/好感度","value":13}]</JSONPatch></UpdateVariable>';
  const result=await R.complete(state,a,content,prepared);assert.equal(result.current.stat_data.好感度,13);assert.ok(result.displayContent.includes('角色卡原生状态栏'));assert.ok(!result.displayContent.includes('<UpdateVariable>'));
  a.messages.push({id:'answer-1',role:'assistant',content,renderedContent:result.renderedContent,displayContent:result.displayContent,status:'complete',runtime:{before:result.before,after:result.current,errors:result.errors,localVariables:result.localVariables}});
  a.messages.push({id:'user-2',role:'user',content:'再聊聊书店。',status:'complete'});prepared=await R.prepare(state,a,E.effectivePrompts(state));assert.equal(prepared.current.stat_data.好感度,13);assert.ok(prepared.books[0].entries[1].content.includes('熟客'));
  const request=E.compile(state,a,prepared).request;assert.equal(request.tool_choice,'required');assert.ok(JSON.stringify(request).includes('山间一直下着细雨'));assert.ok(JSON.stringify(request).includes('skip_thought_signature_validator'));
  const capped=await R.complete(state,a,'<UpdateVariable>_.set("好感度", 120);</UpdateVariable>',prepared);assert.equal(capped.current.stat_data.好感度,100);
  const replay1=await R.complete(state,{...a,messages:a.messages.slice(0,1)},content,{current:result.before});assert.equal(replay1.current.stat_data.好感度,13);
  const directory=fs.mkdtempSync(path.join(__dirname,'../evidence/feature-1.1-data-')),store=new Store(directory);store.save(state);const restored=new Store(directory);assert.equal(restored.state.library.worldbooks.length,2);assert.equal(restored.state.sessions[0].messages[1].runtime.after.stat_data.好感度,13);
  const evidence={passed:true,scope:'new 1.1 features only; no full test suite',checks:['legacy-state migration and global library','per-character book selection without cross-character activation','real upstream MVU initialization and JSONPatch','real upstream MVU Zod clamp','EJS getvar + conditional dynamic prompt','original Meowssiah request and signatures retained','retry recomputes from before-snapshot','library and variables persist after reload'],realCharacterCardTested:false,realProviderTested:false};
  fs.writeFileSync(path.join(__dirname,'../evidence/feature-1.1-check.json'),JSON.stringify(evidence,null,2));fs.writeFileSync(path.join(__dirname,'../evidence/feature-card-1.1.json'),JSON.stringify(makeCard(),null,2));fs.writeFileSync(path.join(__dirname,'../evidence/feature-book-1.1.json'),JSON.stringify(makeBook(),null,2));console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
