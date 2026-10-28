const fail=message=>Object.assign(Error(message),{status:400});
function objectPath(owner,value){
 if(typeof value!=='string'||value.length>1024||/[\\\u0000-\u001f\u007f]/.test(value))throw fail('Choose a valid uploaded file.');
 const parts=value.split('/');if(parts.length<2||parts[0]!==owner||parts.some(p=>!p||p==='.'||p==='..'))throw fail('File ownership mismatch.');
 return parts.map(encodeURIComponent).join('/');
}
async function readUpload(response,limit){
 if(!response.ok||!response.body)throw fail('Unable to read the uploaded file.');
 const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>limit)throw fail('The uploaded file exceeds the size limit.');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.byteLength;if(size>limit)throw fail('The uploaded file exceeds the size limit.');chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks,size);
}
module.exports={objectPath,readUpload};
