// Opaque publishable/secret keys are API keys, not JWT bearer tokens.
module.exports=function supabaseHeaders(publicKey,serviceKey,token=serviceKey){
 if(/^sb_(secret|publishable)_/.test(token))return {apikey:token};
 return {apikey:token===serviceKey?serviceKey:publicKey,Authorization:'Bearer '+token};
};
