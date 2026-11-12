const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startServer}=require('../app/server.cjs'),{Store}=require('../app/core/store.cjs'),E=require('../app/core/engine.cjs');
async function fixture(mode='stream'){
  const received=[];
  const mock=http.createServer(async(req,res)=>{
    if(req.url==='/v1/models'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"data":[{"id":"fixture-model"}]}');return;}
    let raw='';for await(const c of req)raw+=c;received.push({body:JSON.parse(raw),authorization:req.headers.authorization});
    if(mode==='error'){res.writeHead(401,{'Content-Type':'application/json'});return res.end('{"error":{"message":"fixture wrong key TEST-KEY"}}');}
    const args=JSON.stringify({think_nya:'这是模拟接口附带的文本。',game_content:'<game>书店的灯亮着。</game><options><option>走近柜台。</option></options><summary>旅人进入书店。</summary>'});
    if(mode==='json'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({choices:[{message:{tool_calls:[{type:'function',function:{name:'soliumbra_reply',arguments:args}}]},finish_reason:'tool_calls'}],usage:{total_tokens:42}}));}
    res.writeHead(200,{'Content-Type':'text/event-stream'});let i=0;
    const timer=setInterval(()=>{
      if(i===0)res.write('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,id:'call_mock',type:'function',function:{name:'soliumbra_reply',arguments:''},extra_content:{google:{thought_signature:'opaque-fixture-signature'}}}]}}]})+'\n\n');
      const chunk=args.slice(i,i+9);if(chunk)res.write('data: '+JSON.stringify({choices:[{delta:{tool_calls:[{index:0,function:{arguments:chunk}}]}}]})+'\n\n');i+=9;
      if(i>=args.length){clearInterval(timer);res.write('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'tool_calls'}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}})+'\n\n');res.end('data: [DONE]\n\n');}
    },mode==='slow'?80:2);res.on('close',()=>clearInterval(timer));
  });
  await new Promise(r=>mock.listen(0,'127.0.0.1',r));
  const dir=fs.mkdtempSync(path.join(__dirname,'../evidence/test-data-')),app=await startServer({dataDir:dir});
  const home=await fetch(app.origin),cookie=home.headers.get('set-cookie').split(';')[0];await home.text();
  const call=async(route,body)=>{const res=await fetch(app.origin+'/api/'+route,{method:body?'POST':'GET',headers:{cookie,origin:app.origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {res,json:()=>res.json()};};
  const state=(await (await call('bootstrap')).json()).state;state.settings.baseUrl=`http://127.0.0.1:${mock.address().port}/v1`;state.settings.model='fixture-model';state.sessions[0].messages.push({id:'u1',role:'user',content:'我走进书店。',timestamp:Date.now(),status:'complete'});state.sessions[0].note='雨还在下。';
  return {app,mock,call,state,dir,received,close:async()=>{await app.close();await new Promise(r=>mock.close(r));mock.closeAllConnections();}};
}
async function events(res,onEvent){const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',out=[];while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let n;while((n=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,n);buffer=buffer.slice(n+2);if(block.startsWith('data: ')){const event=JSON.parse(block.slice(6));out.push(event);if(onEvent)await onEvent(event);}}}return out;}
test('E4: HTTP stream -> exact original rewritten payload -> tool formatter -> persisted story, key excluded',async()=>{
  const f=await fixture();try{
    await f.call('key',{key:'TEST-KEY'});const models=await (await f.call('models',{settings:f.state.settings})).json();assert.deepEqual(models.models,['fixture-model']);
    const result=await f.call('generate',{state:f.state});assert.equal(result.res.status,200);const es=await events(result.res),done=es.find(e=>e.type==='done');
    assert.ok(es.filter(e=>e.type==='replace').length>2);assert.equal(es.find(e=>e.type==='error'),undefined);assert.ok(done);
    const s=done.state.sessions[0],answer=s.messages.at(-1);assert.match(answer.content,/<game>/);assert.match(answer.content,/<think_nya>/);assert.equal(answer.usage.total_tokens,140);assert.equal(answer.providerCall.signature,'opaque-fixture-signature');
    assert.equal(s.note,'');assert.equal(s.hostMetadata.catgod_oracle.ledger.schema,4);assert.equal(s.messages[0].extra.catgod_oracle.schema,4);
    assert.equal(f.received[0].body.tool_choice,'required');assert.ok(f.received[0].body.toolConfig);assert.equal(f.received[0].authorization,'Bearer TEST-KEY');assert.ok(!JSON.stringify(done.state).includes('TEST-KEY'));assert.ok(!fs.readFileSync(path.join(f.dir,'workspace.json'),'utf8').includes('TEST-KEY'));
    const restored=new Store(f.dir);assert.equal(restored.state.sessions[0].messages.length,2);assert.equal(restored.state.sessions[0].messages[0].extra.catgod_oracle.schema,4);
  }finally{await f.close();}
});
test('E4: nonstream JSON response from compatibility interface follows original formatter',async()=>{
  const f=await fixture('json');try{const {res}=await f.call('generate',{state:f.state});const es=await events(res);assert.ok(es.find(e=>e.type==='done').state.sessions[0].messages.at(-1).content.includes('<game>'));}finally{await f.close();}
});
test('E4: chat mode returns to theater after success, original auto-return can stay off',async()=>{
  const f=await fixture('json');try{f.state.sessions[0].mode='chat';let result=await f.call('generate',{state:f.state});let es=await events(result.res),s=es.find(e=>e.type==='done').state.sessions[0];assert.equal(s.mode,'theater');assert.equal(s.messages.at(-1).mode,'chat');
    f.state.sessions[0].chatAutoReturn=false;result=await f.call('generate',{state:f.state});es=await events(result.res);assert.equal(es.find(e=>e.type==='done').state.sessions[0].mode,'chat');
  }finally{await f.close();}
});
test('E4: cancellation keeps partial content, metadata and unused note',async()=>{
  const f=await fixture('slow');try{let jobId='',stopped=false;const {res}=await f.call('generate',{state:f.state});const es=await events(res,async e=>{if(e.type==='start')jobId=e.jobId;if(e.type==='replace'&&e.text&&!stopped){stopped=true;await f.call('stop',{jobId});}});const done=es.find(e=>e.type==='done');assert.ok(done);assert.equal(done.state.sessions[0].note,'雨还在下。');assert.equal(done.state.sessions[0].messages.at(-1).status,'stopped');}finally{await f.close();}
});
test('E4: provider failure is surfaced, redacts key, retains pending user and note',async()=>{
  const f=await fixture('error');try{await f.call('key',{key:'TEST-KEY'});const {res}=await f.call('generate',{state:f.state});const es=await events(res);const err=es.find(e=>e.type==='error');assert.match(err.error,/401/);assert.ok(!err.error.includes('TEST-KEY'));assert.equal(es.find(e=>e.type==='done').state.sessions[0].messages.length,1);assert.equal(es.find(e=>e.type==='done').state.sessions[0].note,'雨还在下。');}finally{await f.close();}
});
test('E4: local API requires local session and rejects cross-origin writes',async()=>{
  const f=await fixture();try{const r=await fetch(f.app.origin+'/api/bootstrap');assert.equal(r.status,403);const home=await fetch(f.app.origin);const cookie=home.headers.get('set-cookie').split(';')[0];await home.text();const bad=await fetch(f.app.origin+'/api/key',{method:'POST',headers:{cookie,origin:'https://example.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(bad.status,403);const traversal=await fetch(f.app.origin+'/source/original.json');assert.equal(traversal.status,404);}finally{await f.close();}
});
test('E4: automatic previous snapshot restores after corrupt current file',()=>{
  const dir=fs.mkdtempSync(path.join(__dirname,'../evidence/restore-data-'));let s=new Store(dir);const first=s.snapshot();first.sessions[0].title='baseline';s.save(first);const second=s.snapshot();second.sessions[0].title='modified';s.save(second);fs.writeFileSync(path.join(dir,'workspace.json'),'{broken');s=new Store(dir);assert.equal(s.state.sessions[0].title,'baseline');assert.ok(s.notice.includes('恢复'));assert.ok(fs.readdirSync(dir).some(f=>f.startsWith('workspace.corrupt-')));
});
