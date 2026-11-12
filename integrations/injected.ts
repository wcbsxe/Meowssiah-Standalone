// Auto-import equivalents used by the upstream browser modules.
export {_,YAML,console,toastr} from './host';
export {klona} from 'klona';
export function substitudeMacros(input:string){return globalThis.__meowMacros ? globalThis.__meowMacros(input) : input;}
export const substituteParams=substitudeMacros;
export async function eventEmit(name:string,...args:any[]){return globalThis.__meowEmit?.(name,...args);}
export function eventOn(name:string,listener:Function){return globalThis.__meowOn?.(name,listener);}
export function eventRemoveListener(name:string,listener:Function){globalThis.__meowOff?.(name,listener);}
