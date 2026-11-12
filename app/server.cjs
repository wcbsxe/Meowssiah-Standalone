'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Store}=require('./core/store.cjs');
const E=require('./core/engine.cjs');
const provider=require('./core/provider.cjs');
const Runtime=require('./core/card-runtime.cjs');
const Library=require('./core/library.cjs');
const {htmlDocument}=require('./core/card-frame.cjs');
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon'};
const publicDir=path.join(__dirname,'public');
function startServer({dataDir=path.join(__dirname,'../Data'),port=0}={}) {
  const store=new Store(dataDir),token=crypto.randomBytes(32).toString('hex');let apiKey='',origin='',preparing=false;const jobs=new Map(),frames=new Map();
  const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  const readBody=async req=>{let size=0,chunks=[];for await(const c of req){size+=c.length;if(size>30*1024*1024)throw new Error('导入内容超过 30MB。');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new Error('JSON 格式有误。');}};
  const server=http.createServer(async(req,res)=>{
    try {
      if(req.headers.host!==new URL(origin).host) return json(res,403,{error:'请求地址不匹配。'});
      res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
      const url=new URL(req.url,origin);
      if(req.method==='GET' && url.pathname.startsWith('/card-frame/')){
        const frame=frames.get(url.pathname.slice('/card-frame/'.length));if(!frame)return json(res,404,{error:'卡片显示页已过期，请重新打开这条消息。'});
        res.removeHeader('X-Frame-Options');res.setHeader('Content-Security-Policy',`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob: https: http:; font-src data:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${origin}`);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(frame);
      }
      if(!url.pathname.startsWith('/api/')) {
        if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'请求方法不匹配。'});
        const files={'/':'index.html','/app.js':'app.js','/library-ui.js':'library-ui.js','/frame-vendor.js':'frame-vendor.js','/style.css':'style.css','/logo.svg':'logo.svg','/icon.ico':'icon.ico'};
        const file=files[url.pathname];if(!file)return json(res,404,{error:'页面不存在。'});
        if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'请从程序窗口打开。'});
        res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        res.setHeader('Set-Cookie',`meow_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
        res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
        return fs.createReadStream(path.join(publicDir,file)).pipe(res);
      }
      if(!String(req.headers.cookie || '').split(';').some(c=>c.trim()===`meow_session=${token}`))return json(res,403,{error:'请在程序窗口操作。'});
      if(req.headers.origin && req.headers.origin!==origin)return json(res,403,{error:'来源地址不匹配。'});
      if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'请在程序窗口操作。'});
      if(req.method==='GET' && url.pathname==='/api/bootstrap')return json(res,200,{state:store.snapshot(),preset:E.preset,notice:store.notice,keyConfigured:!!apiKey,dataDir});
      if(req.method!=='POST')return json(res,405,{error:'请求方法不匹配。'});
      if(!String(req.headers['content-type']).startsWith('application/json'))return json(res,415,{error:'请使用 JSON 请求。'});
      const body=await readBody(req);
      switch(url.pathname){
        case '/api/state': {
          if(jobs.size||preparing)throw new Error('生成进行中，请停止或等待生成结束再保存改动。');
          return json(res,200,{state:store.save(body.state)});
        }
        case '/api/key':apiKey=String(body.key || '').slice(0,10000).trim();return json(res,200,{configured:!!apiKey});
        case '/api/connection':return json(res,200,{settings:store.saveConnection(body.settings)});
        case '/api/models': {
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
          try{return json(res,200,{models:await provider.models(body.settings || store.state.settings,apiKey,controller.signal)});}finally{clearTimeout(timer);}
        }
        case '/api/import-character':return json(res,200,{profile:body.pngBase64?E.characterFromPng(Buffer.from(body.pngBase64,'base64')):E.importCharacter(body.json)});
        case '/api/import-worldbook':return json(res,200,{entries:E.normalizeWorldbook(body.json)});
        case '/api/library/import-worldbook': {
          const entries=E.normalizeWorldbook(body.json);if(!entries.length)throw Error('文件中没有找到世界书条目。');
          return json(res,200,{worldbook:{id:crypto.randomUUID(),name:String(body.json.name || body.name || '导入的世界书').slice(0,200),entries,source:'用户导入',createdAt:Date.now(),updatedAt:Date.now()}});
        }
        case '/api/library/delete-character': {
          if(jobs.size||preparing)throw Error('请在当前回复完成后删除角色卡。');
          const state=E.normalizeState(body.state || store.snapshot()),result=Library.deleteCharacter(state,String(body.characterId),body.deleteChats===true);
          if(!state.sessions.length){const blank=E.newSession();blank.characterId='';blank.detachedCharacter=Library.detachedCharacter({id:'blank-'+blank.id,profile:blank.profile},'blank-chat');state.sessions.push(blank);state.activeId=blank.id;}
          return json(res,200,{...result,state:store.save(state)});
        }
        case '/api/runtime/inspect': {
          const state=E.normalizeState(body.state || store.snapshot()),s=state.sessions.find(s=>s.id===state.activeId);
          const result=await Runtime.prepare(state,s,E.effectivePrompts(state));
          return json(res,200,{current:result.current,errors:result.errors,warnings:result.warnings,schemaRegistered:result.schemaRegistered,
            books:Library.selectedBooks(state,s).map(b=>({id:b.id,name:b.name,entries:b.entries.length})),compat:Library.resolveProfile(state,s).compat});
        }
        case '/api/card-frame': {
          const id=crypto.randomBytes(20).toString('hex');
          if(String(body.html || '').length>2000000)throw Error('单个卡片界面超过 2MB。');
          frames.set(id,htmlDocument(body.html,{...body.seed,nonce:id}));while(frames.size>60)frames.delete(frames.keys().next().value);
          return json(res,200,{url:origin+'/card-frame/'+id,nonce:id});
        }
        case '/api/card-frame/release': {
          let released=0;for(const nonce of (Array.isArray(body.nonces)?body.nonces:[]).slice(0,512))if(typeof nonce==='string'&&/^[a-f0-9]{40}$/.test(nonce)&&frames.delete(nonce))released++;
          return json(res,200,{released,remaining:frames.size});
        }
        case '/api/runtime/parse': {
          const state=E.normalizeState(body.state),s=state.sessions.find(s=>s.id===state.activeId);
          const prepared=await Runtime.prepare(state,s,E.effectivePrompts(state));
          return json(res,200,await Runtime.complete(state,s,String(body.text || ''),{current:body.old || prepared.current}));
        }
        case '/api/runtime/recalculate': {
          if(jobs.size)throw Error('请先停止生成，再重新计算变量。');
          const state=E.normalizeState(body.state),s=state.sessions.find(s=>s.id===state.activeId),all=[...s.messages],from=Math.max(0,Math.min(all.length,Number(body.fromIndex)||0));
          const firstRuntime=all.slice(from).find(m=>m.runtime?.beforeGlobals);if(firstRuntime)state.library.globalVariables=firstRuntime.runtime.beforeGlobals;
          if(from===0)delete s.runtime;
          s.messages=all.slice(0,from);
          for(const message of all.slice(from)){
            if(message.role==='assistant'){
              const prepared=await Runtime.prepare(state,s,E.effectivePrompts(state));
              const beforeGlobals=structuredClone(state.library.globalVariables || {}),result=await Runtime.complete(state,s,message.content,prepared);
              const card=Library.characterState(state,s);if(card&&result.characterVariables)card.variables=result.characterVariables;
              message.renderedContent=result.renderedContent;message.displayContent=result.displayContent;
              message.runtime={before:result.before,after:result.current,errors:result.errors,warnings:result.warnings,commands:result.commands,mvuUpdate:result.mvuUpdate,
                localVariables:result.localVariables || {},beforeGlobals,globalVariables:result.globalVariables || {}};
              state.library.globalVariables=result.globalVariables || state.library.globalVariables;
            }
            s.messages.push(message);
          }
          return json(res,200,{state:store.save(state)});
        }
        case '/api/preview': {
          const state=E.normalizeState(body.state || store.snapshot()),s=state.sessions.find(s=>s.id===state.activeId);
          const prepared=await Runtime.prepare(state,s,E.effectivePrompts(state));
          return json(res,200,E.compile(state,s,prepared));
        }
        case '/api/stop':jobs.get(String(body.jobId))?.abort();return json(res,200,{stopped:true});
        case '/api/generate': {
          if(jobs.size||preparing)throw new Error('已有一条回答正在生成。');
          const state=E.normalizeState(body.state),session=state.sessions.find(s=>s.id===state.activeId);
          if(session.messages.at(-1)?.role!=='user')throw new Error('请先输入一条消息。');
          if(!state.settings.baseUrl || !state.settings.model)throw new Error('请先在“模型连接”里填写接口地址与模型名。');
          let prepared;preparing=true;try{prepared=await Runtime.prepare(state,session,E.effectivePrompts(state));}finally{preparing=false;}
          const compiled=E.compile(state,session,prepared),urlCheck=provider.endpoint(state.settings.baseUrl,'chat/completions');void urlCheck;
          if(prepared.current && !session.runtime?.initial)session.runtime={...(session.runtime || {}),initial:prepared.current};
          if(compiled.hostMetadata)session.hostMetadata=compiled.hostMetadata;
          const retained=session.messages.filter(m=>m.status!=='error' && m.content.trim());
          for(let i=0;i<retained.length;i++)retained[i].extra=compiled.extras?.[i] || retained[i].extra || {};
          store.save(state);
          const jobId=crypto.randomUUID(),controller=new AbortController();jobs.set(jobId,controller);
          const timer=setTimeout(()=>controller.abort(new Error('请求超时，请检查接口连接或调大超时时间。')),state.settings.timeoutSeconds*1000);
          const answer={id:crypto.randomUUID(),role:'assistant',content:'',timestamp:Date.now(),mode:session.mode,status:'complete',usage:null};
          let disconnected=false;
          res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache','Connection':'keep-alive'});
          res.on('close',()=>{if(!res.writableEnded){disconnected=true;controller.abort();}});
          const emit=e=>{if(!disconnected)res.write(`data: ${JSON.stringify(e)}\n\n`);};
          emit({type:'start',jobId,messageId:answer.id,diagnostics:compiled.diagnostics});
          try {
            const result=await provider.generate(state.settings,apiKey,compiled.request,controller.signal,e=>{if(e.type==='delta')answer.content+=e.text;if(e.type==='replace')answer.content=e.text;emit(e);});
            answer.content=result.content;answer.usage=result.usage;
            if(result.providerCall)answer.providerCall=result.providerCall;
            const beforeGlobals=structuredClone(state.library.globalVariables || {}),processed=await Runtime.complete(state,session,answer.content,prepared);
            const card=Library.characterState(state,session);if(card&&processed.characterVariables)card.variables=processed.characterVariables;
            answer.renderedContent=processed.renderedContent;answer.displayContent=processed.displayContent;
            answer.runtime={before:processed.before,after:processed.current,errors:processed.errors,warnings:processed.warnings,commands:processed.commands,mvuUpdate:processed.mvuUpdate,
              localVariables:processed.localVariables || {},beforeGlobals,globalVariables:processed.globalVariables || {}};
            state.library.globalVariables=processed.globalVariables || state.library.globalVariables;
            if(processed.errors?.length)emit({type:'warning',text:'本轮变量更新存在错误，已在变量面板保留详情。'});
            else if(processed.mvuUpdate?.status==='missing')emit({type:'warning',text:'本轮回复没有变量更新块，变量沿用上一轮。'});
            else if(processed.mvuUpdate?.status==='invalid')emit({type:'warning',text:'本轮变量更新块没有有效指令，请在变量面板查看原文。'});
            if(result.finishReason==='length')emit({type:'warning',text:'模型达到本轮输出上限，正文可能未结束；可调大输出上限后重试。'});
            if(session.noteAutoClear)session.note='';
            if(session.mode==='chat' && session.chatAutoReturn!==false)session.mode='theater';
          } catch(error) {
            answer.status=controller.signal.aborted?'stopped':'error';
            emit({type:'error',error:provider.cleanError(controller.signal.reason?.message || error.message,apiKey),stopped:controller.signal.aborted});
          } finally {
            clearTimeout(timer);jobs.delete(jobId);
            if(body.temporaryChatReplay)session.mode='theater';
            if(answer.content.trim())session.messages.push(answer);
            session.updatedAt=Date.now();
            if(session.title==='未命名的故事')session.title=session.messages.find(m=>m.role==='user')?.content.slice(0,24).replace(/\n/g,' ')||session.title;
            const saved=store.save(state);emit({type:'done',state:saved});res.end();
          }
          return;
        }
        default:return json(res,404,{error:'接口不存在。'});
      }
    } catch(error){if(!res.headersSent)json(res,400,{error:provider.cleanError(error.message,apiKey)});else res.end();}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{
    origin=`http://127.0.0.1:${server.address().port}`;
    resolve({server,origin,store,close:()=>new Promise(r=>{for(const c of jobs.values())c.abort();server.close(r);server.closeIdleConnections();})});
  });});
}
module.exports={startServer};
if(require.main===module)startServer({dataDir:process.env.MEOW_DATA_DIR || path.join(__dirname,'../Data'),port:Number(process.env.PORT || 19209)}).then(s=>console.log('Meowssiah:',s.origin)).catch(e=>{console.error(e.message);process.exitCode=1;});
