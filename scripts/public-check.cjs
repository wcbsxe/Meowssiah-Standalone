'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const list=spawnSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8',windowsHide:true});assert.equal(list.status,0);const files=list.stdout.split('\0').filter(Boolean),issues=[];
const privatePath=/^(?:Data|Meowssiah-Data|evidence|backups|outputs|node_modules|\.cache|dist[^/]*)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:exe|zip|pending)$/i;
const secret=/\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|gg-gcli-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/;
for(const file of files){if(privatePath.test(file))issues.push({file,reason:'private/generated path'});if(!/\.(?:png|ico|jpg|jpeg|wasm)$/i.test(file)&&secret.test(fs.readFileSync(path.join(root,file),'utf8')))issues.push({file,reason:'credential-shaped text'});}
assert.deepEqual(issues,[],'Publication preflight');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'PUBLIC_SOURCE_MANIFEST.json'),'utf8'));assert.equal(manifest.version,require('../package.json').version);for(const row of manifest.applicationFiles)assert.equal(hash(path.join(root,row.file)),row.sha256,row.file);
const checked=files.filter(f=>/^(?:app|scripts)\/.+\.(?:cjs|js)$/.test(f)&&!f.includes('/vendor/')&&!f.endsWith('frame-vendor.js'));
for(const file of checked){const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,file+' '+r.stderr);}
console.log(JSON.stringify({passed:true,trackedFiles:files.length,credentialMatches:0,privateFiles:0,applicationHashes:manifest.applicationFiles.length,syntaxChecks:checked.length,modelRequests:0},null,2));
