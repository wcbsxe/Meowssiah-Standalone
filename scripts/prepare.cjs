const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const bytes = fs.readFileSync(path.join(root, 'source/Meowssiah-2.0.9.original.json'));
const preset = JSON.parse(bytes);
// These are host plumbing, not writing preferences. They remain in the original backup.
const plumbing = new Set(['main', 'enhanceDefinitions', 'nsfw', 'jailbreak', 'version_info', 'SPresetSettings',
  'a00fb1fe-9907-4709-b230-43ae0d236529', '3df19ba7-b44d-4d46-b17a-de514d86e5d5',
  '7a077e05-2616-4b58-b725-53c80ecf4931', 'ab29af7b-4f0e-402f-8236-80b15800e554',
  '34aca678-07d4-4aeb-96ca-37f78617c525', '2cb59685-23fb-4187-9dec-4d9765af9e79',
  '456c5c49-f1b4-4fc2-afc9-3a1851f1a20f', '968c1caa-a85b-42c0-a81a-840c372d61a8',
  'b614d087-a9c0-44cd-a006-0045e95dd014', 'c0db6fd9-86a0-4678-b896-d26ee9a02771']);
const order = preset.prompt_order.find(x => x.character_id === 100001).order;
const ordered = [...order.map(o => ({...preset.prompts.find(p => p.identifier === o.identifier), enabled:o.enabled})),
  ...preset.prompts.filter(p => !order.some(o => o.identifier === p.identifier))];
const prompts = ordered.map((p, index) => {
  const m = String(p.content || '').match(/<<<\|catgodml\|(menu|radio):([^:：>]+)[:：]([^>]+)>>>/);
  return { id:p.identifier, name:p.name, content:p.identifier === 'SPresetSettings' ? '' : (p.content || ''),
    enabled:!!p.enabled, marker:!!p.marker, group:m?.[2] || (p.marker ? '资料位置' : '宿主兼容条目'),
    kind:m?.[1] || 'text', label:m?.[3] || p.name, runtime:!plumbing.has(p.identifier), order:index,
    archivedConfig:p.identifier === 'SPresetSettings' };
});
const data = { name:'Meowssiah', sourceFile:'Meowssiah-2.0.9.json',
  sourceSHA256:crypto.createHash('sha256').update(bytes).digest('hex'), prompts,
  parameters:{temperature:preset.temperature,top_p:preset.top_p},
  originalAuthor:'SoliUmbra', originalNotice:preset.prompts.find(p => p.identifier === 'main')?.content || '',
  migration:{originalPrompts:53,originalRegexes:6,originalHelperScripts:2,
    compiler:'original-spreset-v1', remoteScripts:false,logUpload:false,originalFunctionsExecuted:true,remoteHelperScriptsExecuted:false} };
fs.writeFileSync(path.join(root,'app/data/preset.json'), JSON.stringify(data,null,2));
fs.writeFileSync(path.join(root,'app/data/original.json'),bytes);
const scriptHashes={};
for(const [name,code] of Object.entries({FinalRequestProcessing:preset.extensions.SPreset.FinalRequestProcessing.script,
  OutputPreprocessing:preset.extensions.SPreset.OutputPreprocessing.script,
  ToolFormatter:preset.extensions.SPreset.OutputPreprocessing.toolCallFormatter.script}))scriptHashes[name]=crypto.createHash('sha256').update(code).digest('hex');
fs.writeFileSync(path.join(root,'app/data/script-hashes.json'),JSON.stringify(scriptHashes,null,2));
fs.writeFileSync(path.join(root,'evidence/source-manifest.json'), JSON.stringify({
  sourcePath:'source/Meowssiah-2.0.9.original.json', bytes:bytes.length,
  sha256:data.sourceSHA256, entries:prompts.length, order:order.length,
  runtimePreferences:prompts.filter(p=>p.runtime&&!p.marker).length,
  archivedHostEntries:prompts.filter(p=>!p.runtime).map(p=>({id:p.id,name:p.name})),
},null,2));
console.log('Prepared',prompts.length,'entries; source SHA256',data.sourceSHA256);
