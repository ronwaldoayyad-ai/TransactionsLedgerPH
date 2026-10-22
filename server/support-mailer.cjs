module.exports=function supportMailer(env=process.env){
 if(!env.SUPPORT_SMTP_HOST||!env.SUPPORT_SMTP_USER||!env.SUPPORT_SMTP_PASSWORD||!env.SUPPORT_FROM_EMAIL)return null;
 if(!/^[a-z0-9.-]+$/i.test(env.SUPPORT_SMTP_HOST)||!/^\S+@\S+\.\S+$/.test(env.SUPPORT_FROM_EMAIL))throw Error('Invalid support email configuration.');
 const port=Number(env.SUPPORT_SMTP_PORT||587);if(![465,587].includes(port))throw Error('Support email requires a TLS SMTP port.');
 const transport=require('nodemailer').createTransport({host:env.SUPPORT_SMTP_HOST,port,secure:port===465,requireTLS:true,tls:{rejectUnauthorized:true},auth:{user:env.SUPPORT_SMTP_USER,pass:env.SUPPORT_SMTP_PASSWORD},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false,maxRecipients:1});
 return ({to,code,reference})=>transport.sendMail({from:{name:'LoanLedger PH Support',address:env.SUPPORT_FROM_EMAIL},to:{address:to},subject:'Your support verification code',text:'Your verification code for '+reference+' is '+code+'.\n\nIt expires in 10 minutes. Do not share this code. If you did not request it, ignore this email.'});
};
