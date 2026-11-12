'use strict';
// Shared by the Node request compiler and the isolated QuickJS template runtime.
// Regex changes keyword matching, not whether a constant entry participates.
const MVU_TRIGGER='遵循<must>指令';
function regexParts(key,caseSensitive){
  const source=String(key),literal=source.match(/^\/([\s\S]*)\/([dgimsuvy]*)$/);
  return literal?{source:literal[1],flags:literal[2]}:{source,flags:caseSensitive?'':'i'};
}
function selectEntries(entries,messages,{mvu=false,warnings=[],testRegex}={}){
  const history=messages.filter(m=>m.status!=='error'),rows=[];
  for(const entry of entries){
    if(entry.enabled===false||entry.disable===true||/\[initvar\]|\[InitialVariables\]/i.test(entry.name||entry.comment||''))continue;
    if(entry.constant){rows.push(entry);continue;}
    const configured=entry.extensions?.scan_depth,depth=configured==null?8:Math.max(0,Math.min(100,Number(configured)||0));
    let hay=(depth?history.slice(-depth):[]).map(m=>m.content??m.mes??'').join('\n');
    // These card-authored keys explicitly reserve rules for a variable-update call.
    // In single-pass mode this context is part of the same request, not a second API call.
    if(mvu&&(entry.keys||[]).some(k=>String(k).includes(MVU_TRIGGER)))hay+='\n'+MVU_TRIGGER;
    const includes=key=>{
      if(!entry.regex)return entry.caseSensitive?hay.includes(key):hay.toLowerCase().includes(String(key).toLowerCase());
      try{const pattern=regexParts(key,entry.caseSensitive);return testRegex?testRegex(pattern,hay):new RegExp(pattern.source,pattern.flags).test(hay);}
      catch(error){const message=`世界书「${entry.name||entry.id}」关键词正则：${error.message}`;if(!warnings.includes(message)&&warnings.length<30)warnings.push(message);return false;}
    };
    if((entry.keys||[]).some(includes)&&(!entry.selective||!entry.secondary?.length||entry.secondary.some(includes)))rows.push(entry);
  }
  return rows.sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
}
function mvuContract(){return `<mvu_single_pass_contract>
本轮由同一个对话模型同时生成剧情和 MVU 变量更新，不存在后续的独立变量模型调用。
以本轮 <mvu_current_snapshot> 中的最新变量为起点；历史账本和初始常驻文本中的旧变量仅供追溯。遵守角色卡中已启用的变量规则、字段结构、只读限制与输出格式，只结算本轮新发生的事件。
${MVU_TRIGGER}
将完整变量更新块放在 soliumbra_reply 的 game_content 字段末尾；不要只放进 think_nya、report_nya 或其他隐藏思考字段。
沿用角色卡的更新格式；若卡片没有指定格式，使用 <UpdateVariable><JSONPatch>有效的 JSON Patch 数组</JSONPatch></UpdateVariable>。
没有字段变化时也明确输出 <UpdateVariable><JSONPatch>[]</JSONPatch></UpdateVariable>。不要为产生变化而编造事件、数值、字段或重置初始化值。
</mvu_single_pass_contract>`;}
module.exports={selectEntries,regexParts,mvuContract,MVU_TRIGGER};
