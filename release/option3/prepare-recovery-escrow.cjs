const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {vault,unwrapPortable,open}=require('./recovery-vault.cjs');
const folder=path.resolve(__dirname,'../../.release/recovery-2026-10-22');
function run(){const file=path.join(folder,'.recovery-passphrase.local');if(!fs.existsSync(file)||fs.statSync(file).size===0)throw Error('Fill the protected recovery passphrase file; do not send its contents in chat.');const passphrase=fs.readFileSync(file,'utf8').trim(),v=vault(folder);let key;
 try{const envelope=v.exportPortableKey(passphrase);key=unwrapPortable(envelope,passphrase);const manifest=JSON.parse(fs.readFileSync(path.join(folder,'latest-capture.json'))),dump=manifest.files.find(x=>x.name==='database.dump'),bytes=open(fs.readFileSync(path.join(folder,dump.file)),key);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),dump.sha256);bytes.fill(0);fs.writeFileSync(path.join(folder,'recovery-key.portable.json'),JSON.stringify(envelope,null,2),{flag:'wx',mode:0o600});console.log(JSON.stringify({portableDecryptVerified:true,offMachineCopyConfirmed:false,next:'Store encrypted files and portable key outside this computer; keep the passphrase separately.'}));}finally{key?.fill(0);v.close();}
}
if(require.main===module){try{run();}catch(e){console.error(e.message);process.exitCode=1;}}
