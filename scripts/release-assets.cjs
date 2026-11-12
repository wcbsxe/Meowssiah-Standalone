'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;assert.match(version,/^\d+\.\d+\.\d+$/);
const dir=path.join(root,'dist-'+version,'public'),exe='Meowssiah-'+version+'-Windows-x64.exe';fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(path.join(root,'dist-'+version,exe),path.join(dir,exe));
fs.writeFileSync(path.join(dir,'Start.cmd'),['@echo off','setlocal','if not defined MEOW_DATA_DIR (','  if exist "%~dp0..\\Meowssiah-Data\\" (','    set "MEOW_DATA_DIR=%~dp0..\\Meowssiah-Data"','  ) else (','    set "MEOW_DATA_DIR=%~dp0Meowssiah-Data"','  )',')','start "" /D "%~dp0" "%~dp0'+exe+'"','endlocal',''].join('\r\n'),'ascii');
for(const [from,to]of [['README.md','README.zh-CN.md'],['THIRD_PARTY_NOTICES.md','THIRD_PARTY_NOTICES.md']])fs.copyFileSync(path.join(root,from),path.join(dir,to));
const names=[exe,'Start.cmd','README.zh-CN.md','THIRD_PARTY_NOTICES.md'];const lines=names.map(name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('hex')+'  '+name);fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),lines.join('\n')+'\n');console.log('Prepared '+dir);
