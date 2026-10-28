// Offline guard: never prints matched credentials. History audit is a separate,
// protected operator step; this prevents new tracked secrets from reaching CI.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
function inspect(text,file){
 const findings=[];
 const patterns=[['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['provider secret',/\b(?:sb_secret_[A-Za-z0-9_-]{18,}|sk-(?:proj-|or-v1-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[A-Z0-9]{16}|[0-9]{8,12}:[A-Za-z0-9_-]{30,})\b/g],['database credential',/postgres(?:ql)?:\/\/[^\s:'"<>]+:([^\s@'"<>]+)@[^\s'"<>]+/g],['JWT',/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g]];
 for(const [kind,re]of patterns)for(const m of text.matchAll(re)){
  if(/fixture|placeholder|replace|your[_-]|example|PROJECT|USER:PASSWORD/i.test(m[0]))continue;
  if(kind==='database credential'&&(/postgres:postgres@(?:127\.0\.0\.1|localhost):/.test(m[0])||file.startsWith('tests/')))continue;
  if(kind==='JWT'){try{if(JSON.parse(Buffer.from(m[0].split('.')[1],'base64url')).role==='anon')continue;}catch{continue;}}
  findings.push({file,line:text.slice(0,m.index).split('\n').length,kind});
 }
 if(/(?:^|\/)\.env(?:\.|$)/.test(file)&&!file.endsWith('.example'))findings.push({file,line:1,kind:'tracked environment file'});
 return findings;
}
function scan(root){const result=cp.spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'});if(result.status)throw Error('Cannot enumerate source files.');const findings=[];let checked=0;for(const file of result.stdout.split('\0').filter(Boolean)){const full=path.join(root,file);if(!fs.existsSync(full))continue;const bytes=fs.readFileSync(full);if(bytes.includes(0)||bytes.length>12582912)continue;checked++;findings.push(...inspect(bytes.toString('utf8'),file));}return {checked,findings};}
if(require.main===module){const result=scan(process.cwd());console.log(JSON.stringify(result,null,2));if(result.findings.length)process.exitCode=1;}
module.exports={inspect,scan};
