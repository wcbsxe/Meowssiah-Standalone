'use strict';
const fs=require('node:fs'),path=require('node:path');
function resolveDataDir({override,portableDir,exeDir,developmentDir}){
  if(override)return path.resolve(override);
  const dir=portableDir || exeDir;
  if(!dir)return path.resolve(developmentDir);
  const parent=path.dirname(dir),shared=path.join(parent,'Meowssiah-Data');
  if(/^v\d+\.\d+\.\d+(?:[-.].+)?$/i.test(path.basename(dir)) &&
    (fs.existsSync(shared)||fs.existsSync(path.join(parent,'启动最新版.cmd'))))return shared;
  return path.join(dir,'Meowssiah-Data');
}
module.exports={resolveDataDir};
