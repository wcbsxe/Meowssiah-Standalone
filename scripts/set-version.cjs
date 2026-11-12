'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=process.argv[2];assert.match(version||'',/^\d+\.\d+\.\d+$/,'Use: node scripts/set-version.cjs 1.1.8');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),write=(f,v)=>fs.writeFileSync(path.join(root,f),JSON.stringify(v,null,2)+'\n');
const pkg=read('package.json'),old=pkg.version;assert.notEqual(version,old);pkg.version=version;pkg.build.directories.output='dist-'+version;pkg.build.portable.artifactName='Meowssiah-'+version+'-Windows-x64.exe';write('package.json',pkg);
const lock=read('package-lock.json');lock.version=version;if(lock.packages?.[''])lock.packages[''].version=version;write('package-lock.json',lock);
for(const file of ['app/public/index.html','app/public/app.js','README.md']){let s=fs.readFileSync(path.join(root,file),'utf8');if(file.endsWith('index.html'))s=s.replace('<span>v'+old+'</span>','<span>v'+version+'</span>');else if(file.endsWith('app.js'))s=s.replace(old+'：',version+'：');else s=s.replace('**'+old+'**','**'+version+'**');fs.writeFileSync(path.join(root,file),s);}
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
write('PUBLIC_SOURCE_MANIFEST.json',{version,source:'maintained release source',applicationFiles:walk(path.join(root,'app')).map(f=>({file:path.relative(root,f).replace(/\\/g,'/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}))});
console.log('Version '+old+' -> '+version+'. Review changes, then commit and create tag v'+version+'.');
