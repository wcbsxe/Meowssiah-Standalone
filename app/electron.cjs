const {app,BrowserWindow,Menu,shell}=require('electron');
const path=require('node:path');
const {startServer}=require('./server.cjs');
const {resolveDataDir}=require('./core/data-dir.cjs');
let runtime;
const edition=process.env.MEOW_SPECIAL_EDITION||require('../package.json').specialEdition||'';
if(process.env.MEOW_USER_DATA_DIR)app.setPath('userData',process.env.MEOW_USER_DATA_DIR);
else if(edition==='seraphina')app.setPath('userData',path.join(app.getPath('appData'),'Meowssiah-Seraphina'));
if(!app.requestSingleInstanceLock())app.quit();
else {
  let win;
  app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
  app.whenReady().then(async()=>{
    const portable=process.env.PORTABLE_EXECUTABLE_DIR;
    const dataDir=resolveDataDir({override:process.env.MEOW_DATA_DIR,portableDir:portable,exeDir:app.isPackaged?path.dirname(app.getPath('exe')):null,developmentDir:path.join(__dirname,'../Data')});
    runtime=await startServer({dataDir,edition});
    win=new BrowserWindow({width:edition?1600:1440,height:edition?1020:960,minWidth:edition?1000:860,minHeight:edition?720:640,title:edition==='seraphina'?'Meowssiah · 绯月专属版':'Meowssiah · 小猫之神',
      backgroundColor:edition?'#211d29':'#f7f4ef',icon:path.join(__dirname,'public/icon.ico'),
      show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
    win.once('ready-to-show',()=>win.show());
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',(e,url)=>{if(!url.startsWith(runtime.origin+'/'))e.preventDefault();});
    win.webContents.session.setPermissionRequestHandler((wc,perm,callback)=>callback(false));
    const menu=Menu.buildFromTemplate([
      {label:'文件',submenu:[{label:'打开本机数据目录',click:()=>shell.openPath(dataDir)},{type:'separator'},{role:'quit',label:'退出'}]},
      {label:'编辑',submenu:[{role:'undo',label:'撤销'},{role:'redo',label:'重做'},{type:'separator'},{role:'cut',label:'剪切'},{role:'copy',label:'复制'},{role:'paste',label:'粘贴'},{role:'selectAll',label:'全选'}]},
      {label:'视图',submenu:[{role:'reload',label:'重新载入'},{role:'resetZoom',label:'实际大小'},{role:'zoomIn',label:'放大'},{role:'zoomOut',label:'缩小'},{role:'togglefullscreen',label:'全屏'}]}
    ]);Menu.setApplicationMenu(menu);
    await win.loadURL(runtime.origin);
    win.on('closed',()=>{win=null;});
  }).catch(error=>{require('electron').dialog.showErrorBox('Meowssiah 启动出错',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>{runtime?.server.close();});
}
