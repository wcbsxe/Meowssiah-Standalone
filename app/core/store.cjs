const fs=require('node:fs');
const path=require('node:path');
const {defaultState,normalizeState}=require('./engine.cjs');
class Store {
  constructor(dir){
    this.dir=dir;this.file=path.join(dir,'workspace.json');this.previous=path.join(dir,'workspace.previous.json');this.notice='';
    fs.mkdirSync(dir,{recursive:true});
    this.state=defaultState();
    if(fs.existsSync(this.file)) {
      try {const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));
        const old=path.join(dir,'workspace.before-1.1.json');if(!raw.library&&!fs.existsSync(old))fs.copyFileSync(this.file,old);
        this.state=normalizeState(raw);}
      catch {
        fs.copyFileSync(this.file,path.join(dir,`workspace.corrupt-${Date.now()}.json`));
        try {this.state=normalizeState(JSON.parse(fs.readFileSync(this.previous,'utf8')));this.notice='主存档读取出错，已恢复上一份自动备份。出错文件已保留。';}
        catch {this.notice='存档读取出错，已保留原文件并创建空白工作区。';}
      }
    }
  }
  save(input){
    const state=normalizeState(input);state.revision=this.state.revision+1;
    const tmp=path.join(this.dir,'workspace.pending.json');
    fs.writeFileSync(tmp,JSON.stringify(state,null,2),'utf8');
    if(fs.existsSync(this.file)) fs.copyFileSync(this.file,this.previous);
    fs.renameSync(tmp,this.file);this.state=state;return this.snapshot();
  }
  snapshot(){return structuredClone(this.state);}
}
module.exports={Store};
