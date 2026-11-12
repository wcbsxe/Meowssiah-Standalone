const path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto'),esbuild=require('esbuild');
const root=path.resolve(__dirname,'..');
const host=path.join(root,'integrations/host.ts');
const plugins=[{name:'standalone-host',setup(build){
  build.onResolve({filter:/^@\//},a=>{
    const map={'@/function/schema':'upstream/mvu/src/function/schema.ts','@/variable_def':'upstream/mvu/src/variable_def.ts',
      '@/function/update_variables':'upstream/mvu/src/function/update_variables.ts','@/function/initvar/variable_init':'upstream/mvu/src/function/initvar/variable_init.ts'};
    return {path:map[a.path]?path.join(root,map[a.path]):host};
  });
  build.onResolve({filter:/^@util\/common$/},()=>({path:path.join(root,'upstream/mvu-zod/common.ts')}));
  build.onResolve({filter:/script\.js$|lib\.js$|extensions\.js$|modules\/ui$/},a=>a.importer.includes('prompt-template')?{path:host}:null);
}}];
(async()=>{
  fs.mkdirSync(path.join(root,'app/vendor'),{recursive:true});
  await esbuild.build({entryPoints:[path.join(root,'integrations/runtime.ts')],bundle:true,format:'iife',globalName:'MeowCardRuntime',platform:'browser',target:'es2023',outfile:path.join(root,'app/vendor/card-runtime.js'),minify:true,legalComments:'eof',plugins,inject:[path.join(root,'integrations/injected.ts')],logLevel:'warning'});
  await esbuild.build({entryPoints:[path.join(root,'integrations/frame-vendor.ts')],bundle:true,format:'iife',platform:'browser',target:'es2022',outfile:path.join(root,'app/public/frame-vendor.js'),minify:true,legalComments:'eof',logLevel:'warning'});
  const pins=['mvu','mvu-zod','prompt-template'].map(name=>({name,...JSON.parse(fs.readFileSync(path.join(root,'upstream',name,'pin.json')))}));
  const hashes={};for(const f of ['app/vendor/card-runtime.js','app/public/frame-vendor.js'])hashes[f]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
  fs.writeFileSync(path.join(root,'app/data/integrations.json'),JSON.stringify({pins,hashes,hostVersion:'1.1.0'},null,2));console.log('Built local MVU + EJS runtime',hashes);
})().catch(e=>{console.error(e);process.exitCode=1;});
