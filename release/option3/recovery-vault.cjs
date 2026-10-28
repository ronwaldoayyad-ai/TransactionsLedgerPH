const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const MAGIC=Buffer.from('LLR1');
function seal(plain,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('A 256-bit recovery key is required.');
  const nonce=crypto.randomBytes(12),header=Buffer.concat([MAGIC,nonce]);
  const cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(header);
  return Buffer.concat([header,cipher.update(plain),cipher.final(),cipher.getAuthTag()]);
}
function open(envelope,key){
  if(envelope.length<32||!envelope.subarray(0,4).equals(MAGIC))throw Error('Invalid recovery envelope.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,envelope.subarray(4,16));
  decipher.setAAD(envelope.subarray(0,16));decipher.setAuthTag(envelope.subarray(-16));
  return Buffer.concat([decipher.update(envelope.subarray(16,-16)),decipher.final()]);
}
function wrapPortable(key,passphrase){
  if(typeof passphrase!=='string'||Buffer.byteLength(passphrase)<20)throw Error('Use a recovery passphrase of at least 20 bytes.');
  const salt=crypto.randomBytes(16),derived=crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:134217728});
  try{return {format:'LoanLedgerRecoveryKey-v1',kdf:'scrypt-N32768-r8-p1',salt:salt.toString('base64'),wrapped:seal(key,derived).toString('base64')};}finally{derived.fill(0);}
}
function unwrapPortable(envelope,passphrase){
  if(envelope.format!=='LoanLedgerRecoveryKey-v1'||envelope.kdf!=='scrypt-N32768-r8-p1')throw Error('Unsupported recovery key envelope.');
  const salt=Buffer.from(envelope.salt,'base64');if(salt.length!==16)throw Error('Invalid recovery salt.');
  const derived=crypto.scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:134217728});
  try{const key=open(Buffer.from(envelope.wrapped,'base64'),derived);if(key.length!==32){key.fill(0);throw Error('Invalid recovery key.');}return key;}finally{derived.fill(0);}
}
function dpapi(mode,bytes){
  if(process.platform!=='win32')throw Error('Windows CurrentUser DPAPI is required for this recovery key.');
  const shell=process.env.RECOVERY_POWERSHELL||'powershell.exe';
  const result=cp.spawnSync(shell,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'recovery-dpapi.ps1'),'-Mode',mode],{input:bytes.toString('base64'),encoding:'utf8',windowsHide:true,maxBuffer:1048576});
  if(result.status!==0)throw Error('Windows could not '+mode+' the recovery key. No payload was logged.');
  return Buffer.from(result.stdout.trim(),'base64');
}
function vault(directory){
  const root=path.resolve(directory),marker=path.sep+'.release'+path.sep;
  if(!root.includes(marker))throw Error('Recovery files must remain in an ignored .release folder.');
  fs.mkdirSync(root,{recursive:true});
  const keyPath=path.join(root,'recovery-key.current-user.dpapi');let key;
  if(fs.existsSync(keyPath))key=dpapi('unprotect',fs.readFileSync(keyPath));
  else{key=crypto.randomBytes(32);fs.writeFileSync(keyPath,dpapi('protect',key),{flag:'wx',mode:0o600});}
  if(key.length!==32)throw Error('Recovery key is invalid.');
  const safe=name=>{if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name))throw Error('Invalid recovery filename.');return path.join(root,name+'.aesgcm')};
  return {
    put(name,plain){const bytes=Buffer.isBuffer(plain)?plain:Buffer.from(plain);const file=safe(name);fs.writeFileSync(file,seal(bytes,key),{flag:'wx',mode:0o600});return {file:path.basename(file),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};},
    get(name){return open(fs.readFileSync(safe(name)),key);},
    exportPortableKey(passphrase){return wrapPortable(key,passphrase);},
    close(){key.fill(0);},
    keyScope:'Windows CurrentUser DPAPI; separate off-machine key escrow is required for disaster recovery.'
  };
}
module.exports={seal,open,vault,wrapPortable,unwrapPortable};
