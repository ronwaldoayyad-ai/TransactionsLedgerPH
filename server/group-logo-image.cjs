const sharp=require('sharp'),{sanitizeGroupLogo,MAX_SVG}=require('./group-logo-svg.cjs');
const MAX_PNG=2097152,MAX_REQUEST=3145728,signature=Buffer.from([137,80,78,71,13,10,26,10]);
const fail=message=>{throw Object.assign(Error(message),{status:400})};
// A fixed, server-generated SVG image container preserves the existing storage
// contract and old borrowers. Only its validated/re-encoded PNG bytes are embedded.
const wrapped=/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) (\d+)"><image width="\1" height="\2" href="(data:image\/png;base64,[A-Za-z0-9+/=]+)"\/><\/svg>$/;
async function normalizePng(uri){
 const match=String(uri).match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);if(!match||match[1].length>Math.ceil(MAX_PNG/3)*4)fail('Choose a valid PNG up to 2 MB.');
 const bytes=Buffer.from(match[1],'base64');if(!bytes.length||bytes.length>MAX_PNG||!bytes.subarray(0,8).equals(signature)||bytes.toString('base64')!==match[1])fail('The file is not a valid PNG.');
 try{const meta=await sharp(bytes,{failOn:'warning',limitInputPixels:16000000}).metadata();if(meta.format!=='png'||!meta.width||!meta.height||(meta.pages||1)>1)fail('Choose a static PNG image.');
  for(const size of [512,384,256,192,128,96,64]){const {data,info}=await sharp(bytes,{failOn:'warning',limitInputPixels:16000000}).resize(size,size,{fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toBuffer({resolveWithObject:true});const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+info.width+' '+info.height+'"><image width="'+info.width+'" height="'+info.height+'" href="data:image/png;base64,'+data.toString('base64')+'"/></svg>';if(Buffer.byteLength(svg)<=MAX_SVG)return svg}
 }catch(error){if(error.status===400)throw error;fail('The PNG could not be decoded safely. Re-export it as a PNG and try again.');}
 fail('The PNG is too complex for a group logo. Try a smaller image.');
}
async function sanitizeGroupLogoImage(raw){if(typeof raw!=='string')fail('Choose an SVG or PNG logo.');if(raw.startsWith('data:image/png;base64,'))return normalizePng(raw);const canonical=raw.length<=MAX_SVG?raw.match(wrapped):null;if(canonical)return normalizePng(canonical[3]);return sanitizeGroupLogo(raw)}
module.exports={sanitizeGroupLogoImage,MAX_PNG,MAX_REQUEST};
