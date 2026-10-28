const {Worker}=require('node:worker_threads'),path=require('node:path');
// Explicit trace anchors: the validator loads these inside its worker on Vercel.
require.resolve('sharp');require.resolve('@napi-rs/image');require.resolve('pdf-lib');require.resolve('fflate');require.resolve('fast-xml-parser');
module.exports=(bytes,mime)=>new Promise((resolve,reject)=>{
 const worker=new Worker(path.join(__dirname,'file-validator-worker.cjs'),{workerData:{bytes,mime},resourceLimits:{maxOldGenerationSizeMb:128}});
 let settled=false;
 const finish=error=>{if(settled)return;settled=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve()};
 const timer=setTimeout(()=>finish(Error('File validation timed out. Please retry.')),15000);
 worker.once('message',result=>finish(result.valid?null:Error('The file is corrupt or its format is incorrect.')));
 worker.once('error',()=>finish(Error('File validation is unavailable. Please retry.')));
 worker.once('exit',code=>{if(code!==0)finish(Error('File validation could not complete. Please retry.'))});
});
