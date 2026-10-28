const {test}=require('node:test'),assert=require('node:assert/strict'),{objectPath,readUpload}=require('../../server/upload-security.cjs');
const owner='11111111-1111-4111-8111-111111111111';
test('upload object paths preserve the owner and encode special filename characters without path or query confusion',()=>{
 assert.equal(objectPath(owner,owner+'/receipt #1?.png'),owner+'/receipt%20%231%3F.png');
 for(const p of ['foreign/file.png',owner+'/../file.png',owner+'/./file.png',owner+'//file.png',owner+'/folder\\file.png',owner+'/file\0.png','',null,owner+'/'+'x'.repeat(1025)])assert.throws(()=>objectPath(owner,p));
});
test('upload response reads are bounded for declared and streamed sizes',async()=>{
 assert.equal((await readUpload(new Response('valid'),5)).toString(),'valid');
 await assert.rejects(readUpload(new Response('too large',{headers:{'Content-Length':'999999'}}),5),/size limit/);
 await assert.rejects(readUpload(new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(3));c.enqueue(new Uint8Array(3));c.close()}})),5),/size limit/);
 await assert.rejects(readUpload(new Response(null,{status:404}),5),/Unable to read/);
});
