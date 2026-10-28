const publicError=require('./public-service-error.cjs');
module.exports=({service,origin,onError=detail=>console.warn('[notification-rules] Request failed',detail)})=>async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('Vary','Origin')
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end(JSON.stringify({error:'Origin is not allowed.'}));return}
 try{
  if(req.method!=='POST')throw Error('Use a supported notification action.')
  const routes={list:'list',preview:'preview',save:'save',delete:'remove',restore:'restore',activity:'activity',retry:'retry',sent:'sent','sent-delete':'deleteSent','sent-edit':'sentEdit',archive:'archive',link:'link',unlink:'unlink',presentation:'presentation',emit:'emit',categories:'categories','category-save':'categorySave','category-delete':'categoryDelete'}
  const action=routes[req.url.slice('/notification-rules/'.length)];if(!action)throw Error('Unsupported notification action.')
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>(['emit','sentEdit'].includes(action)?12500000:150000))throw Error('The request is too large.');chunks.push(chunk)}
  const body=JSON.parse(Buffer.concat(chunks).toString()||'{}');const result=await service[action](req,body);res.end(JSON.stringify(result))
 }catch(error){
  const result=publicError(error,{fallback:'Notifications are temporarily unavailable. Please try again.'})
  if(result.status===503)onError({code:error.code||'INTERNAL'})
  res.writeHead(result.status);res.end(JSON.stringify(result.body))
 }
}
