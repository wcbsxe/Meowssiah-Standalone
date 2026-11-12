'use strict';
const fs=require('node:fs'),path=require('node:path');let css;
const navigation=`<nav class="special-card-entries" aria-label="角色功能入口">${'${'}[['profile','角色档案','profile'],['status','状态详情','status'],['wardrobe','服装管理','dress'],['family','庄园关系','heart'],['switch','角色切换','users'],['pregnancy','孕育状态','pregnancy']].map(([v,t,i])=>\`<button data-view="\${v}" aria-haspopup="dialog">\${icon(i)}<span>\${t}</span></button>\`).join('')}</nav>`;
function decoded(source){
  if(source.includes('id="meow-special-dock"'))return source;
  const menu=/<button class="menu-toggle"[\s\S]*?<\/button>/;
  if(!source.includes('<title>绯月 · 角色界面</title>')||!menu.test(source)||!source.includes('function setView(v){if(pending)return;')||!source.includes(' lastWritable=writable();')||!source.includes('\nboot();\n})();'))throw Error('当前角色界面结构与专属适配版本不一致。');
  css ||= fs.readFileSync(path.join(__dirname,'../public/special-card.css'),'utf8');source=source.replace('</head>','<style id="meow-special-dock">'+css+'</style></head>');
  source=source.replace(menu,navigation).replace('<p>${esc(cfg.title)}</p>','<p>${esc(cfg.title)}</p><p class="special-worn">当前服装：${esc(wornName())}</p>');
  source=source.replace('function setView(v){if(pending)return;','function setView(v){if(pending)return;if(v===\'menu\')v=\'close\';');
  source=source.replace('function writable(){if(preview)return true;','function writable(){if(window.MeowFrameUI?.readOnly())return false;if(preview)return true;');
  source=source.replaceAll("app.querySelector('[data-menu-toggle]')","app.querySelector('.special-card-entries button')").replaceAll('zoomFactor=1.55','zoomFactor=1').replaceAll('adjustPortrait(1.55','adjustPortrait(1');
  source=source.replace(' lastWritable=writable();',` window.MeowFrameUI?.present({open:!!view||zoomed,kind:view?'panel':'portrait',title:view?titles[view]:active+' · 立绘'});\n lastWritable=writable();`);
  return source.replace('\nboot();\n})();',`\nwindow.addEventListener('meow-presentation-close',()=>{if(pending)return;zoomed=false;setView('close')});\nwindow.addEventListener('meow-context-refresh',()=>{generating=!!window.MeowFrameUI?.generating();if(initialized)refresh(true)});\nboot();\n})();`);
}
function adapt(html){const input=String(html),pattern=/const raw=atob\('([A-Za-z0-9+/=]+)'\)/,match=input.match(pattern);if(!match)return decoded(input);const original=Buffer.from(match[1],'base64').toString('utf8'),result=decoded(original);if(result===original)return input;return input.replace(pattern,"const raw=atob('"+Buffer.from(result).toString('base64')+"')");}
module.exports={adapt};
