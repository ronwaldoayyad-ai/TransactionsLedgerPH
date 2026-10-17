const test=require('node:test'),assert=require('node:assert/strict');
const validate=require('../../server/file-validator.cjs');
const sharp=require('sharp'),{PDFDocument}=require('pdf-lib'),{zipSync,strToU8}=require('fflate');
for(const [format,mime] of [['png','image/png'],['jpeg','image/jpeg'],['webp','image/webp'],['avif','image/avif'],['gif','image/gif']]){
 test('serverless validator fully decodes '+mime,async()=>{const data=await sharp({create:{width:8,height:8,channels:3,background:'#ffffff'}}).toFormat(format).toBuffer();await validate(data,mime);await assert.rejects(validate(data,'image/bmp'));});
}
test('BMP compatibility is preserved',async()=>{const b=Buffer.alloc(58);b.write('BM');b.writeUInt32LE(58,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);b.writeInt32LE(1,18);b.writeInt32LE(1,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);b.writeUInt32LE(4,34);await validate(b,'image/bmp')});
test('valid PDF accepted; empty or corrupt PDFs rejected',async()=>{const p=await PDFDocument.create();p.addPage();await validate(Buffer.from(await p.save()),'application/pdf');await assert.rejects(validate(Buffer.from('%PDF-1.7\n%%EOF'),'application/pdf'));});
test('Word archives require valid document XML',async()=>{const valid=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<w:document xmlns:w="test"/>')});await validate(Buffer.from(valid),'application/vnd.openxmlformats-officedocument.wordprocessingml.document');const invalid=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<broken>')});await assert.rejects(validate(Buffer.from(invalid),'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));});
test('empty files and invalid image bytes fail validation',async()=>{await assert.rejects(validate(Buffer.alloc(0),'image/png'));await assert.rejects(validate(Buffer.from('not an image'),'image/png'));});
