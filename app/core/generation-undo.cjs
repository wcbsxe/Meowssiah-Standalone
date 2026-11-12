'use strict';
const crypto=require('node:crypto'),Library=require('./library.cjs');
const clone=x=>structuredClone(x),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const characterId=s=>s.characterId || s.detachedCharacter?.id || '';
function configuration(state,story){return hash({profile:story.profile,books:Library.selectedBooks(state,story),prompts:state.promptStates});}
function checksum(point){const {checksum:unused,status,...data}=point;return hash(data);}
function validate(point){return point?.version===1&&typeof point.id==='string'&&['ready','restoring'].includes(point.status)&&point.story?.id===point.storyId&&Array.isArray(point.story.messages)&&point.checksum===checksum(point);}
function capture(state,storyId,view={},kind='send'){
  const story=state.sessions.find(s=>s.id===storyId);if(!story)throw Error('聊天已移出当前工作区。');
  const card=Library.characterState(state,story),anchor=view.anchor;
  const ui={draft:typeof view.draft==='string'?view.draft:'',windowEnd:Number.isInteger(view.windowEnd)?Math.max(0,Math.min(story.messages.length,view.windowEnd)):null,
    scrollTop:Number.isFinite(view.scrollTop)?Math.max(0,view.scrollTop):0,followLatest:view.followLatest===true,
    anchor:anchor?.storyId===storyId&&typeof anchor.messageId==='string'&&Number.isFinite(anchor.offset)?{storyId,messageId:anchor.messageId,offset:anchor.offset,windowEnd:Number.isInteger(anchor.windowEnd)?anchor.windowEnd:null}:null,
    diagnostics:view.diagnostics&&typeof view.diagnostics==='object'?clone(view.diagnostics):null};
  if(view.special&&typeof view.special==='object')ui.special={page:typeof view.special.page==='string'?view.special.page.slice(0,30):'story',messageId:typeof view.special.messageId==='string'?view.special.messageId.slice(0,100):null};
  const point={version:1,id:crypto.randomUUID(),status:'ready',storyId,characterId:characterId(story),createdAt:Date.now(),kind:kind==='retry'?'retry':'send',
    configuration:configuration(state,story),story:clone(story),characterVariables:clone(card?.variables || {}),globalVariables:clone(state.library.globalVariables || {}),view:ui};
  point.checksum=checksum(point);return point;
}
function info(state,point){
  if(!validate(point))return null;const story=state.sessions.find(s=>s.id===point.storyId);
  if(!story||characterId(story)!==point.characterId||configuration(state,story)!==point.configuration)return null;
  return {id:point.id,storyId:point.storyId,createdAt:point.createdAt,kind:point.kind,storyTitle:point.story.title,previousMessageCount:point.story.messages.length};
}
function restore(state,point){
  if(!info(state,point))throw Error('这份回撤点对应的聊天或运行资料已改变。');
  const next=clone(state),index=next.sessions.findIndex(s=>s.id===point.storyId);next.sessions[index]=clone(point.story);next.activeId=point.storyId;
  const card=Library.characterState(next,next.sessions[index]);if(card)card.variables=clone(point.characterVariables);
  next.library.globalVariables=clone(point.globalVariables);return next;
}
module.exports={capture,restore,info,validate};
