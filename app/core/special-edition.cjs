'use strict';
const Data=require('../public/special-data.js');
function info(edition,state){
  if(edition!=='seraphina')return null;
  const cards=state.library?.characters||[],active=state.sessions.find(s=>s.id===state.activeId),card=cards.find(c=>c.id===active?.characterId&&Data.matches(c.profile))||cards.find(c=>Data.matches(c.profile));
  return {id:'seraphina',name:'绯月专属版',version:'1.0.0',baseVersion:'1.1.9',cardId:card?.id||null};
}
module.exports={info};
