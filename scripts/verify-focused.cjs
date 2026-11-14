'use strict';
// Personal-project check: affected paths only; no application startup or model call.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),checks=[
  ['special and single-step undo',['--test','tests/special.test.cjs','tests/generation-undo.test.cjs']],
  ['original request boundary',['--test','--test-name-pattern=E1:|original initial context|12-pair archival|original formatter','tests/engine.test.cjs']],
  ['source backup preflight',['scripts/source-check.cjs']]
],results=[];
for(const [name,args]of checks){const r=spawnSync(process.execPath,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});results.push({name,command:['node',...args],exitCode:r.status,stdout:r.stdout||'',stderr:r.stderr||'',error:r.error?.message||null});process.stdout.write(name+'\n'+(r.stdout||'')+(r.stderr||''));if(r.status!==0||r.error)break;}
const result={passed:results.length===checks.length&&results.every(r=>r.exitCode===0&&!r.error),checkedAt:new Date().toISOString(),fullSuiteRun:false,modelRequests:0,checks:results};
fs.mkdirSync(path.join(root,'evidence'),{recursive:true});fs.writeFileSync(path.join(root,'evidence/focused-check.json'),JSON.stringify(result,null,2)+'\n');if(!result.passed)process.exitCode=1;
