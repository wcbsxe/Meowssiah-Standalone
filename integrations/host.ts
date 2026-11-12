// Host interfaces supplied to the upstream MVU and Prompt Template reusable modules.
import lodash from 'lodash';
import * as YAMLModule from 'yaml';
export const _=lodash;
export const YAML=YAMLModule;
export let ENV:any={};
export let chat:any[]=[];
export let chat_metadata:any={variables:{}};
export let extension_settings:any={variables:{global:{}}};
export const settings={debug_enabled:false,autosave_enabled:false};
export const yaml={parse:YAML.parse,stringify:YAML.stringify,dump:YAML.stringify,load:YAML.parse};
export function configure(input:any){
  ENV=input;chat=input.chat;chat_metadata={variables:input.localVariables || {}};extension_settings={variables:{global:input.globalVariables || {}}};
}
export async function saveChatConditional(){}
export const console={log(){},info(){},debug(){},warn(...args:any[]){ENV.warnings?.push(args.map(String).join(' '));},error(...args:any[]){ENV.warnings?.push(args.map(String).join(' '));}};
export const toastr={error:(message:any,title?:any)=>ENV.errors?.push([title,message].filter(Boolean).join(': ')),warning:(message:any,title?:any)=>ENV.warnings?.push([title,message].filter(Boolean).join(': ')),success(){},info(){}};
export function useDataStore(){return {settings:{通知:{变量更新出错:false}},effective_settings:{兼容性:{更新到聊天变量:false,显示变量更新信息:false}},runtimes:{is_during_extra_analysis:false},should_enable:true};}
export function tr(key:string,data:any={}){return key.replace(/^runtime\./,'')+(Object.keys(data).length?' '+JSON.stringify(data):'');}
export function getLastValidVariable(end:number){return _(chat).slice(0,end).map((m:any)=>m.variables?.[0]).findLast((v:any)=>v?.stat_data);}
export function isJsonPatch(patch:any){return Array.isArray(patch)&&patch.every(op=>_.isPlainObject(op)&&typeof op.op==='string'&&(typeof op.path==='string'||(op.op==='move'&&typeof op.to==='string')));}
