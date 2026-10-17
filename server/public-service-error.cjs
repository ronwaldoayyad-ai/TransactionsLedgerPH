// Public service responses must not expose database, TLS or runtime details.
module.exports=function publicServiceError(error,{fallback='The service is temporarily unavailable. Please try again.'}={}){
 const code=String(error?.code||'');
 const infrastructure=/^[0-9A-Z]{5}$/.test(code)||/^(?:ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CERT_|ERR_TLS|SELF_SIGNED_CERT|UNABLE_TO_(?:VERIFY|GET_ISSUER))/.test(code)||error instanceof TypeError||['AbortError','TimeoutError'].includes(error?.name);
 if(infrastructure)return {status:503,body:{error:fallback}};
 if(error instanceof SyntaxError)return {status:400,body:{error:'The request could not be read. Please try again.'}};
 return {status:error?.status||400,body:{error:error?.message||'The request could not be completed. Please retry.',...(code?{code}:{}),...(error?.login?{login:error.login}:{})}};
};
