'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
function origin(base){
  if(!base)return '';
  const url=new URL(String(base));
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw Error('请填写有效的接口地址。');
  return url.origin;
}
function protect(value,decrypt=false){
  if(process.platform!=='win32')throw Error('本机密钥加密需要 Windows 用户环境。');
  const code=`$ErrorActionPreference='Stop';Add-Type -AssemblyName System.Security;$inputText=[Console]::In.ReadToEnd();$bytes=[Convert]::FromBase64String($inputText.Trim());$entropy=[Text.Encoding]::UTF8.GetBytes('Meowssiah-api-key-v1');$result=[Security.Cryptography.ProtectedData]::${decrypt?'Unprotect':'Protect'}($bytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($result))`;
  const input=decrypt?value:Buffer.from(value,'utf8').toString('base64');
  const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',code],{input,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:128*1024});
  if(result.status!==0||result.error||!result.stdout.trim())throw Error(decrypt?'本机密钥读取出错，请重新填写并记住。':'本机密钥加密保存出错，请重试。');
  return decrypt?Buffer.from(result.stdout.trim(),'base64').toString('utf8'):result.stdout.trim();
}
class ApiKeyStore{
  constructor(dataDir,crypto={encrypt:value=>protect(value),decrypt:value=>protect(value,true)}){this.file=path.join(dataDir,'连接','密钥.json');this.crypto=crypto;}
  read(){if(!fs.existsSync(this.file))return {version:1,entries:{}};const value=JSON.parse(fs.readFileSync(this.file,'utf8'));if(value.version!==1||!value.entries||typeof value.entries!=='object'||Array.isArray(value.entries))throw Error('本机密钥配置格式有误。');return value;}
  has(base){return !!this.read().entries[origin(base)]?.encryptedKey;}
  load(base){const item=this.read().entries[origin(base)];if(!item)return '';if(item.protection!=='windows-current-user-dpapi'||typeof item.encryptedKey!=='string')throw Error('本机密钥配置格式有误。');return this.crypto.decrypt(item.encryptedKey);}
  save(base,key){const host=origin(base),value=String(key||'').trim();if(!host)throw Error('请先填写接口地址，再记住密钥。');if(!value||value.length>10000)throw Error('请输入有效的 API 密钥。');const saved=this.read();saved.entries[host]={protection:'windows-current-user-dpapi',encryptedKey:this.crypto.encrypt(value),updatedAt:Date.now()};fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.pending',JSON.stringify(saved,null,2)+'\n',{encoding:'utf8',mode:0o600});fs.renameSync(this.file+'.pending',this.file);return true;}
  remove(base){const saved=this.read();delete saved.entries[origin(base)];if(!Object.keys(saved.entries).length){if(fs.existsSync(this.file))fs.unlinkSync(this.file);return;}fs.writeFileSync(this.file+'.pending',JSON.stringify(saved,null,2)+'\n',{encoding:'utf8',mode:0o600});fs.renameSync(this.file+'.pending',this.file);}
}
module.exports={ApiKeyStore,origin};
