const publicError=require('./public-service-error.cjs');
module.exports=({service,origin})=>async(req,res)=>{
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Origin');
 if(req.headers.origin&&req.headers.origin!==origin){res.writeHead(403);res.end(JSON.stringify({error:'Origin is not allowed.'}));return}
 try{
  const action=req.url.slice('/telegram/'.length);if(req.method!=='POST'||!['list','begin','connect','save','test','retry'].includes(action))throw Error('Unsupported Telegram action.');
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>4096)throw Error('The request is too large.');chunks.push(chunk)}
  const result=await service[action](req,JSON.parse(Buffer.concat(chunks).toString()||'{}'));res.end(JSON.stringify(result));
 }catch(error){const r=publicError(error,{fallback:'Telegram settings are temporarily unavailable. Please retry.'});res.writeHead(r.status);res.end(JSON.stringify(r.body));}
};
