const {parentPort,workerData}=require('node:worker_threads');
const bytes=Buffer.from(workerData.bytes),mime=workerData.mime;
async function validate(){
 if(!bytes.length||bytes.length>10485760)throw Error('Invalid file size');
 if(mime.startsWith('image/')){
  if(mime==='image/bmp'){
   if(bytes.length<54||bytes.toString('ascii',0,2)!=='BM')throw Error('Invalid BMP');
   const width=Math.abs(bytes.readInt32LE(18)),height=Math.abs(bytes.readInt32LE(22));
   if(!width||!height||width*height>16000000)throw Error('Unsupported dimensions');
   const {Transformer}=require('@napi-rs/image');await new Transformer(bytes).png();return;
  }
  if(mime==='image/avif'&&(bytes.toString('ascii',4,8)!=='ftyp'||!['avif','avis'].some(brand=>bytes.subarray(8,Math.min(bytes.readUInt32BE(0),256)).includes(Buffer.from(brand)))))throw Error('Invalid AVIF brand');
  const sharp=require('sharp'),expected={'image/jpeg':'jpeg','image/png':'png','image/webp':'webp','image/gif':'gif','image/avif':'heif'};
  sharp.concurrency(1);
  const image=sharp(bytes,{failOn:'warning',limitInputPixels:16000000});
  const metadata=await image.metadata();
  if(metadata.format!==expected[mime]||!metadata.width||!metadata.height||metadata.width*metadata.height>16000000)throw Error('Format mismatch');
  await image.raw().toBuffer();return;
 }
 if(mime==='application/pdf'){
  if(bytes.toString('ascii',0,5)!=='%PDF-'||!bytes.subarray(-2048).includes(Buffer.from('%%EOF')))throw Error('Invalid PDF');
  const {PDFDocument}=require('pdf-lib');const pdf=await PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});
  if(pdf.isEncrypted||pdf.getPageCount()<1)throw Error('Unsupported PDF');return;
 }
 if(mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'){
  const {unzipSync,strFromU8}=require('fflate');let size=0,count=0;
  const entries=unzipSync(bytes,{filter:entry=>{size+=entry.originalSize;count++;if(size>50*1024*1024||count>1000||entry.name.split('/').includes('..'))throw Error('Unsupported archive');return true;}});
  if(!entries['[Content_Types].xml']||!entries['word/document.xml'])throw Error('Invalid Word document');
  const xml=strFromU8(entries['word/document.xml']);if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported XML');
  if(require('fast-xml-parser').XMLValidator.validate(xml)!==true)throw Error('Invalid XML');return;
 }
 if(mime==='application/msword'&&bytes.length>=512&&bytes.length%512===0&&bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))return;
 throw Error('Unsupported format');
}
validate().then(()=>parentPort.postMessage({valid:true})).catch(()=>parentPort.postMessage({valid:false}));
