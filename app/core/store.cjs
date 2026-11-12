'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {defaultState,normalizeState,normalizeSettings}=require('./engine.cjs');
const clone=x=>structuredClone(x);
const filename=id=>/^[a-z0-9_-]{1,72}$/i.test(id)&&!/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(id)?id+'.json':crypto.createHash('sha256').update(String(id)).digest('hex').slice(0,32)+'.json';
class Store {
  constructor(dir){
    this.dir=path.resolve(dir);this.notice='';this.state=defaultState();this.manifest=null;
    this.paths={chats:path.join(this.dir,'聊天'),connection:path.join(this.dir,'连接'),characters:path.join(this.dir,'角色卡'),worldbooks:path.join(this.dir,'世界书'),workspace:path.join(this.dir,'工作台'),backups:path.join(this.dir,'备份')};
    for(const p of Object.values(this.paths))fs.mkdirSync(p,{recursive:true});
    this.file=path.join(this.paths.workspace,'设置.json');this.previous=path.join(this.paths.backups,'自动','上一份工作区.json');
    this.connectionFile=path.join(this.paths.connection,'设置.json');this.connectionPrevious=path.join(this.paths.backups,'自动','上一份连接.json');
    this.journal=path.join(this.paths.workspace,'待完成写入.json');
    const legacy=path.join(this.dir,'workspace.json');let migrated=false,recovered=false;
    if(fs.existsSync(this.journal)){
      try{this.state=normalizeState(this.read(this.journal));recovered=true;this.notice='已恢复上次中断的本地保存。';}
      catch{this.preserveDamaged(this.journal);}
    }
    if(!recovered){
      try{
        if(fs.existsSync(this.file))this.state=this.readStructured();
        else if(fs.existsSync(legacy)){this.state=normalizeState(this.read(legacy));migrated=true;}
      }catch{
        const damaged=fs.existsSync(this.file)?this.file:legacy;this.preserveDamaged(damaged);
        const candidates=[this.previous,path.join(this.dir,'workspace.previous.json')];let restored=false;
        for(const candidate of candidates){try{this.state=normalizeState(this.read(candidate));restored=true;break;}catch{}}
        this.notice=restored?'存档读取出错，已恢复上一份自动备份。原文件已留在备份文件夹。':'存档读取出错，原文件已留在备份文件夹。';
        recovered=true;
      }
    }
    const legacyConnection=path.join(this.dir,'connection.json');
    const connectionSource=fs.existsSync(this.connectionFile)?this.connectionFile:fs.existsSync(legacyConnection)?legacyConnection:null;
    if(connectionSource){
      try{this.state.settings=normalizeSettings(this.read(connectionSource).settings);}
      catch{
        this.preserveDamaged(connectionSource);
        try{this.state.settings=normalizeSettings(this.read(this.connectionPrevious).settings);}catch{}
        this.notice=[this.notice,'连接文件读取出错，已恢复最近保存的设置。'].filter(Boolean).join('\n');
      }
    }
    this.writeConnection(this.state.settings);
    if(migrated||recovered||!fs.existsSync(this.file))this.writeState(this.state,false);
    if(fs.existsSync(legacy))this.archiveLegacy();
  }
  read(file){return JSON.parse(fs.readFileSync(file,'utf8'));}
  assetPath(kind,file){
    if(typeof file!=='string'||path.basename(file)!==file||!file.endsWith('.json'))throw Error('存档文件名有误。');
    const root=this.paths[kind],target=path.resolve(root,file),relative=path.relative(root,target);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('存档路径有误。');return target;
  }
  readStructured(){
    const meta=this.read(this.file);if(meta.storageVersion!==2)throw Error('存储版本有误。');
    const load=kind=>(meta[kind] || []).map(file=>this.read(this.assetPath(kind,file)));
    const state=normalizeState({...meta,settings:this.state.settings,sessions:load('chats'),library:{version:1,globalVariables:meta.globalVariables || {},characters:load('characters'),worldbooks:load('worldbooks')}});
    this.manifest=meta;return state;
  }
  atomic(file,value){
    fs.mkdirSync(path.dirname(file),{recursive:true});const text=JSON.stringify(value,null,2);
    if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===text)return;
    const tmp=file+'.pending';fs.writeFileSync(tmp,text,'utf8');fs.renameSync(tmp,file);
  }
  preserveDamaged(file){
    if(!fs.existsSync(file))return;
    const dest=path.join(this.paths.backups,'异常',Date.now()+'-'+path.basename(file));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(file,dest);
  }
  archiveLegacy(){
    const dir=path.join(this.paths.backups,'升级前-1.1');fs.mkdirSync(dir,{recursive:true});
    for(const name of ['workspace.json','workspace.previous.json','workspace.before-1.1.json','connection.json','connection.previous.json']){
      const src=path.join(this.dir,name);if(!fs.existsSync(src))continue;
      let dst=path.join(dir,name);if(fs.existsSync(dst))dst=path.join(dir,Date.now()+'-'+name);
      fs.copyFileSync(src,dst);
      const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if(digest(src)!==digest(dst))throw Error('旧存档备份校验失败：'+name);
      fs.unlinkSync(src);
    }
  }
  writeConnection(settings){
    const normalized=normalizeSettings(settings);
    if(fs.existsSync(this.connectionFile)){try{const old=this.read(this.connectionFile);if(JSON.stringify(old.settings)!==JSON.stringify(normalized))this.atomic(this.connectionPrevious,old);}catch{}}
    this.atomic(this.connectionFile,{version:1,settings:normalized});
  }
  saveConnection(input){
    const settings=normalizeSettings(input);this.writeConnection(settings);this.state.settings=settings;return clone(settings);
  }
  writeState(state,backup=true){
    const oldManifest=this.manifest;
    this.atomic(this.journal,state);
    if(backup&&fs.existsSync(this.file))this.atomic(this.previous,this.state);
    const meta={storageVersion:2,schemaVersion:1,revision:state.revision,activeId:state.activeId,promptStates:state.promptStates,ui:state.ui,
      globalVariables:state.library.globalVariables,chats:[],characters:[],worldbooks:[]};
    const write=(kind,items)=>{for(const item of items){const file=filename(item.id),data=clone(item);if(kind==='chats'&&!data.detachedCharacter)delete data.profile;this.atomic(this.assetPath(kind,file),data);meta[kind].push(file);}};
    write('chats',state.sessions);write('characters',state.library.characters);write('worldbooks',state.library.worldbooks);
    this.atomic(this.file,meta);this.manifest=meta;
    if(fs.existsSync(this.journal))fs.unlinkSync(this.journal);
    // Only remove files owned by the previous manifest after the new commit and backup exist.
    for(const kind of ['chats','characters','worldbooks'])for(const file of oldManifest?.[kind] || [])if(!meta[kind].includes(file)){
      const owned=this.assetPath(kind,file);if(fs.existsSync(owned))fs.unlinkSync(owned);
    }
  }
  save(input){
    const state=normalizeState(input);state.revision=this.state.revision+1;
    // Chat imports and autosaves leave this computer's connection selection intact.
    state.settings=clone(this.state.settings);this.writeState(state);this.state=state;return this.snapshot();
  }
  snapshot(){return clone(this.state);}
}
module.exports={Store};
