const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const E=require('../app/core/engine.cjs'),O=require('../app/core/original-runtime.cjs');
function sample(){const state=E.defaultState(),session=state.sessions[0];session.profile.description='一位山间书店店主';session.profile.worldBefore='山路有一座书店。';session.messages.push({id:'u1',role:'user',content:'我推开书店的门。',status:'complete'});return {state,session};}
function commit(s,c){s.hostMetadata=c.hostMetadata;s.messages.forEach((m,i)=>m.extra=c.extras[i]);}
test('E1: source backup and all original request/output functions are byte-identical',()=>{
  const data=fs.readFileSync(path.join(__dirname,'../source/Meowssiah-2.0.9.original.json'));
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'),E.preset.sourceSHA256);assert.equal(E.preset.prompts.length,53);
  assert.deepEqual(JSON.parse(data).extensions.SPreset.FinalRequestProcessing,O.source.extensions.SPreset.FinalRequestProcessing);
  for(const [key,code] of Object.entries({FinalRequestProcessing:O.source.extensions.SPreset.FinalRequestProcessing.script,OutputPreprocessing:O.source.extensions.SPreset.OutputPreprocessing.script,ToolFormatter:O.source.extensions.SPreset.OutputPreprocessing.toolCallFormatter.script}))assert.equal(crypto.createHash('sha256').update(code).digest('hex'),O.hashes[key]);
});
test('E3: original initial context, reply/context tools and signatures survive',()=>{
  const {state,session}=sample(),c=E.compile(state,session);assert.equal(c.diagnostics.compiler,'original-spreset-v1');
  assert.equal(c.request.messages.length,7);assert.equal(c.request.tool_choice,'required');assert.equal(c.request.toolConfig.functionCallingConfig.mode,'ANY');
  assert.deepEqual(c.request.tools.map(t=>t.function.name),['soliumbra_reply','context']);
  assert.equal(c.request.messages.find(m=>m.tool_calls)?.tool_calls[0].signature,'skip_thought_signature_validator');
  assert.equal(c.request.messages.find(m=>m.tool_calls)?.tool_calls[0].extra_content.google.thoughtSignature,'skip_thought_signature_validator');
  assert.equal(c.hostMetadata.catgod_oracle.ledger.schema,4);assert.match(c.request.messages.find(m=>m.name==='context').content,/山路有一座书店/);
});
test('E3: original note / chat / deepThink branches stay active',()=>{
  const {state,session}=sample();session.mode='chat';session.deepThink=true;session.note='先讨论世界设定。';
  const c=E.compile(state,session),sync=JSON.parse(c.request.messages.at(-1).content);
  assert.equal(sync.mode,'chat');assert.equal(sync.director_note,session.note);
  assert.match(c.request.tools[0].function.parameters.properties.think_nya.description,/深度/);
  assert.match(c.request.tools[0].function.parameters.properties.game_content.description,/聊天/);
});
test('E3: original incremental rule diff persists across save/load and retry',()=>{
  const {state,session}=sample();const first=E.compile(state,session);commit(session,first);
  session.messages.push({id:'a1',role:'assistant',content:'<game>柜台后的人抬起头。</game><summary>旅人入店。</summary>',status:'complete'},
    {id:'u2',role:'user',content:'我问店主这是什么地方。',status:'complete'});
  const target=E.preset.prompts.find(p=>p.name.includes('情绪别太激烈'));state.promptStates[target.id]={enabled:false};
  let c=E.compile(state,session);const tool=JSON.parse(c.request.messages.find(m=>m.name==='soliumbra_reply').content);
  assert.ok(tool.deactivated_rules.some(r=>r.name.includes('情绪')));commit(session,c);
  const restored=E.normalizeState(JSON.parse(JSON.stringify(state))),rs=restored.sessions[0];c=E.compile(restored,rs);
  assert.ok(JSON.parse(c.request.messages.find(m=>m.name==='soliumbra_reply').content).deactivated_rules.some(r=>r.name.includes('情绪')));
});
test('E3: original 12-pair archival rule keeps recent 4 and archives oldest 8',()=>{
  const {state,session}=sample();
  for(let i=1;i<=12;i++)session.messages.push({id:'a'+i,role:'assistant',content:`<game>正文${i}</game><summary>场记${i}</summary>`,status:'complete'},
    {id:'u'+(i+1),role:'user',content:'继续'+i,status:'complete'});
  const c=E.compile(state,session),hist=c.request.messages.filter(m=>m.tool_calls?.[0].function.name==='soliumbra_reply');
  assert.equal(hist.length,4);const context=c.request.messages.find(m=>m.name==='context').content;
  assert.match(context,/第8幕场记归档/);assert.doesNotMatch(context,/第9幕场记归档/);
});
test('E3: original formatter full + partial JSON behavior, no custom schema substitution',()=>{
  const full=O.originalFormat([{arguments:JSON.stringify({think_nya:'模型附带文本',game_content:'书店的门开了。',options:'<option>坐下</option>',summary:'旅人入店。',comment:'喵。'})}]);
  assert.match(full,/<game>/);assert.match(full,/<summary>/);assert.match(full,/<think_nya>/);
  const partial=O.originalFormat([{arguments:'{"game_content":"书店的门'}]);assert.match(partial,/书店的门/);
  assert.equal(O.originalOutput('原样正文',true).output,'原样正文');
});
test('E3: pg- model keeps original automatic tool-choice branch',()=>{
  const {state,session}=sample();state.settings.model='pg-test';const c=E.compile(state,session);assert.equal(c.request.tool_choice,'auto');assert.equal(c.request.toolConfig,undefined);
});
test('worldbook keywords, constant, D0 and deep positions reach original context',()=>{
  const {state,session}=sample();session.profile.worldbook=E.normalizeWorldbook([
    {id:'one',name:'常驻',content:'常驻规则',constant:true,position:0},
    {id:'two',name:'书店关键词',content:'书店触发资料',keys:['书店'],position:1},
    {id:'three',name:'D0',content:'深度零规则',constant:true,position:4,depth:0}]);
  const c=E.compile(state,session),dump=JSON.stringify(c.request);for(const t of ['常驻规则','书店触发资料','深度零规则'])assert.ok(dump.includes(t));
  const rt=E.profile(session.profile);assert.equal(rt.worldbook[2].originalPosition,4);assert.equal(rt.worldbook[1].position,'after');
});
test('JSON character V2 and normalized state retain original ledger/extras; keys are dropped',()=>{
  const p=E.importCharacter({spec:'chara_card_v2',data:{name:'书店主人',description:'店主',first_mes:'你好',character_book:{entries:[{keys:['猫'],content:'猫的资料'}]}}});assert.equal(p.name,'书店主人');assert.equal(p.worldbook.length,1);
  const {state,session}=sample();commit(session,E.compile(state,session));state.settings.apiKey='TEST-SECRET';state.apiKey='TEST-SECRET';
  const normalized=E.normalizeState(state);assert.ok(!JSON.stringify(normalized).includes('TEST-SECRET'));assert.equal(normalized.sessions[0].messages[0].extra.catgod_oracle.schema,4);
});
test('source script and reference evaluation agree on a controlled fixture',()=>{
  const seed={request:{model:'fixture',stream:true,messages:[{role:'system',content:'<run_tool_replacement>\n|用户：旅人|\n|小猫之神|欢迎\n<<<|catgodml|historyStart>>>'},{role:'user',content:'推门'},{role:'system',content:'<<<|catgodml|historyEnd>>>'}],tools:[O.replyTool()]},settings:O.source,chat:[{mes:'推门',is_user:true}],metadata:{},oracle:{mode:'theater',note:{text:''}},worldEntries:[],chatId:'parity'};
  const got=O.originalRewrite(structuredClone(seed));const fixture=structuredClone(seed);
  const ctx={chatCompletionSettings:fixture.settings,chat:fixture.chat,chatMetadata:fixture.metadata,getCurrentChatId:()=>fixture.chatId,saveMetadataDebounced(){},eventTypes:{},eventSource:{on(){}}};
  const w={SillyTavern:{getContext:()=>ctx},CatGodOracle:{state:fixture.oracle},localStorage:{getItem:()=>JSON.stringify(fixture.oracle)},__catgodLastActivatedWi:{entries:[]},dispatchEvent(){},CustomEvent:class{}};w.top=w;w.parent=w;
  const run=vm.runInNewContext('('+JSON.parse(fs.readFileSync(path.join(__dirname,'../source/Meowssiah-2.0.9.original.json'))).extensions.SPreset.FinalRequestProcessing.script+')',{window:w,console:{warn(){},log(){}}});
  const expected=JSON.parse(JSON.stringify(run({request:fixture.request})));assert.deepEqual(got.request,expected);
});
test('PNG character card tEXt payload imports correctly and rejects ordinary PNG',()=>{
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  const data=Buffer.from('chara\0'+Buffer.from(JSON.stringify({name:'测试店主',description:'一位书店主人',first_mes:'欢迎进来。'})).toString('base64'));
  const type=Buffer.from('tEXt'),crcInput=Buffer.concat([type,data]);let crc=0xffffffff;
  for(const b of crcInput){crc^=b;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
  const head=Buffer.alloc(8),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);type.copy(head,4);tail.writeUInt32BE(crc);
  const card=Buffer.concat([png.subarray(0,png.length-12),head,data,tail,png.subarray(png.length-12)]);
  assert.equal(E.characterFromPng(card).name,'测试店主');assert.throws(()=>E.characterFromPng(png),/没有角色卡数据/);
});
