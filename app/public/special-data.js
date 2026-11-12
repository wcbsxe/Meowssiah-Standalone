(function(root,factory){const value=factory();if(typeof module==='object'&&module.exports)module.exports=value;else root.SpecialData=value;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const parsed=new WeakMap();
  const tags=(text,tag,partial=false)=>[...String(text||'').matchAll(new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)(?:<\\/'+tag+'\\s*>'+(partial?'|$':'')+')','gi'))].map(m=>m[1].trim()).filter(Boolean);
  function clean(text){return String(text||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:p|div|section|h[1-6])\s*>/gi,'\n\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&').trim();}
  function parse(message,partial=false){
    const cache=!partial&&message&&typeof message==='object'?parsed.get(message):null;if(cache&&cache.content===message.content&&cache.rendered===message.renderedContent)return cache.parts;
    const original=typeof message==='string'?message:String(message?.content||''),rendered=typeof message==='string'?message:String(message?.renderedContent??message?.content??'');
    const auxiliary=/<(think_nya|report_nya|think|thinking|summary|comment|background|options|must|UpdateVariable|Analysis|JSONPatch)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
    const games=tags(rendered,'game',partial),base=games.length?games.join('\n\n'):rendered.replace(auxiliary,'').replace(/<(?:think_nya|report_nya|think|thinking|summary|comment|background|options|must|UpdateVariable|Analysis|JSONPatch)\b[\s\S]*$/i,'');
    const story=clean(base.replace(auxiliary,'').replace(/<StatusPlaceHolderImpl\s*\/?\s*>/gi,'').replace(/```(?:html)?\s*[\s\S]*?atob\([\s\S]*?```/gi,''));
    const parts={story,thought:[...tags(original,'think_nya',partial),...tags(original,'report_nya',partial),...tags(original,'thinking',partial),...tags(original,'think',partial)].map(clean).join('\n\n'),summary:tags(rendered,'summary',partial).map(clean).join('\n\n'),comment:tags(rendered,'comment',partial).map(clean).join('\n\n'),background:tags(rendered,'background',partial).map(clean).join('\n\n'),options:[...new Set(tags(rendered,'option',partial).map(clean))]};
    if(!partial&&message&&typeof message==='object')parsed.set(message,{content:message.content,rendered:message.renderedContent,parts});return parts;
  }
  function layers(session){const rows=[];let number=0;for(const [index,message]of (session.messages||[]).entries()){
    if(message.role!=='assistant'||message.mode==='chat')continue;const parts=parse(message);if(!parts.story)continue;
    const opening=rows.length===0&&!session.messages.slice(0,index).some(m=>m.role==='user');const label=opening?'开场':'第 '+(++number)+' 层';
    const event=parts.summary.match(/(?:【?本轮事件(?:链)?】?|【?事件(?:进展|摘要)?】?)\s*[：:]\s*([^\n]+)/)?.[1],summary=event||parts.summary.replace(/^\s*【[^\n]*】\s*\n/,'').replace(/^[-*]\s*【[^】]+】\s*[：:]\s*/gm,'')||parts.story.split(/\n+/)[0],first=opening?'故事开场':summary.replace(/[*#`]/g,'').split(/[。！？；;\n]/)[0].trim();
    rows.push({id:message.id,index,message,parts,opening,number:opening?0:number,label,title:first.length>18?first.slice(0,18)+'…':first||'未命名故事',introduction:summary.length>140?summary.slice(0,140)+'…':summary});
  }return rows;}
  function record(session,layer){if(!layer)return {user:null,note:'',chats:[],attempts:[]};const messages=session.messages||[],context=layer.message.turnContext||{};
    const user=messages.find(m=>m.id===context.userMessageId&&m.role==='user')||messages.slice(0,layer.index).findLast(m=>m.role==='user')||null;
    const next=layers(session).find(x=>x.index>layer.index),tail=messages.slice(layer.index+1,next?.index??messages.length),chats=[];
    for(let i=0;i<tail.length;i++){const m=tail[i];if(m.mode==='chat'||m.role==='user'&&tail[i+1]?.mode==='chat')chats.push(m);}
    return {user,note:typeof context.directorNote==='string'?context.directorNote:'',chats,attempts:next?[]:tail.filter(m=>!chats.includes(m))};
  }
  function uiHtml(profile){return (profile?.regexes||[]).find(r=>r.disabled!==true&&/绯月.*立绘互动状态栏/.test(r.scriptName||r.name||''))?.replaceString||'';}
  function matches(profile){return !!uiHtml(profile)&&(profile.helperScripts||[]).some(s=>s.enabled!==false&&/绯月UI.*作者配置/.test(s.name||''));}
  return {parse,layers,record,clean,uiHtml,matches};
});
