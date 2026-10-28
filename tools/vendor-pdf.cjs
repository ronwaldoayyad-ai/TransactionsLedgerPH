const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function vendor(root){
 const source=path.join(root,'node_modules/pdfjs-dist'),output=path.join(root,'public/assets/ocr'),pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
 if(pkg.version!==JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).devDependencies['pdfjs-dist'])throw Error('Install the pinned PDF parser before vendoring.');
 const manifestPath=path.join(output,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.resources=manifest.resources.filter(r=>!/^pdf(?:[/.]|js-)/.test(r.name));
 const record=(name,bytes,url)=>{fs.mkdirSync(path.dirname(path.join(output,name)),{recursive:true});fs.writeFileSync(path.join(output,name),bytes);manifest.resources.push({name,url,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});};
 const copy=(from,to)=>record(to,fs.readFileSync(path.join(source,from)),'https://cdn.jsdelivr.net/npm/pdfjs-dist@'+pkg.version+'/'+from);
 copy('legacy/build/pdf.min.mjs','pdf.min.mjs');copy('legacy/build/pdf.worker.min.mjs','pdf.worker.min.mjs');copy('LICENSE','pdfjs-LICENSE');
 for(const folder of ['cmaps','standard_fonts'])for(const name of fs.readdirSync(path.join(source,folder)))if(!name.endsWith('.map'))copy(folder+'/'+name,'pdf/'+folder+'/'+name);
 for(const name of ['jbig2.wasm','jbig2_nowasm_fallback.js','openjpeg.wasm','openjpeg_nowasm_fallback.js','qcms_bg.wasm','LICENSE_JBIG2','LICENSE_OPENJPEG','LICENSE_PDFJS_JBIG2','LICENSE_PDFJS_OPENJPEG','LICENSE_PDFJS_QCMS','LICENSE_QCMS'])copy('wasm/'+name,'pdf/wasm/'+name);
 // Older already-open pages can still request the UMD filename. Serve only an
 // adapter to the patched module, never the retired v3 parser.
 const adapter="(()=>{window.pdfjsLib={GlobalWorkerOptions:{},getDocument(options){return {promise:import('/assets/ocr/pdf.min.mjs').then(api=>{api.GlobalWorkerOptions.workerSrc='/assets/ocr/pdf.worker.min.mjs';return api.getDocument({...options,isEvalSupported:false,cMapUrl:location.origin+'/assets/ocr/pdf/cmaps/',cMapPacked:true,standardFontDataUrl:location.origin+'/assets/ocr/pdf/standard_fonts/',wasmUrl:location.origin+'/assets/ocr/pdf/wasm/'}).promise;})};}};})();\n";
 record('pdf.min.js',Buffer.from(adapter),'local:patched-pdf-compatibility-adapter');record('pdf.worker.min.js',Buffer.from("import('/assets/ocr/pdf.worker.min.mjs');\n"),'local:patched-pdf-worker-adapter');
 manifest.pdfjsVersion=pkg.version;manifest.pdfjsEvalDisabled=true;manifest.resources.sort((a,b)=>a.name.localeCompare(b.name));fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({pdfjsVersion:pkg.version,resources:manifest.resources.length,networkRequests:0}));
}
if(require.main===module)vendor(process.cwd());module.exports={vendor};
