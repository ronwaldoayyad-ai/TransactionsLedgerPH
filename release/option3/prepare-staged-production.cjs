// Default mode prepares a review only. Applying requires separate owner approval
// of the resulting plan hash. This tool never runs SQL, promotes or assigns users.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const {vault}=require('./recovery-vault.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22'),cli=path.resolve(root,'../deployment-tools/node_modules/vercel/dist/index.js');
const project='prj_lFG8NQ36IlahbssDCeLU05eQOBtp',team='team_KNkwRoBk8bClKGsYZxOUWedb',scope='ronwaldoayyad-ais-projects',existingDeployment='dpl_CYvxQeZ4ts3LCxLJw4X5v78oitTs';
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function git(...args){const r=cp.spawnSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('Cannot verify release source.');return r.stdout.trim();}
function run(args,input){const r=cp.spawnSync(process.execPath,[cli,...args,'--scope',scope,'--non-interactive'],{cwd:root,input,encoding:'utf8',windowsHide:true,maxBuffer:16777216,timeout:600000});if(r.status!==0)throw Object.assign(Error('Staging command failed; protected diagnostics retained.'),{privateDiagnostic:JSON.stringify({stdout:r.stdout,stderr:r.stderr})});return r.stdout;}
function productionState(){
 const data=JSON.parse(run(['api','/v9/projects/'+project+'?teamId='+team,'--method','GET']));
 if(data.id!==project||data.targets?.production?.id!==existingDeployment)throw Error('The production deployment changed; review it before proceeding.');
 const raw=JSON.parse(run(['api','/v10/projects/'+project+'/env?teamId='+team+'&decrypt=false','--method','GET']));
 return {deployment:data.targets.production.id,envs:(raw.envs||raw).filter(x=>x.target?.includes('production'))};
}
function main(){const v=vault(folder);let applying=false;try{
 if(git('status','--porcelain'))throw Error('The release working tree must be clean.');
 const commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),review=JSON.parse(fs.readFileSync(path.join(folder,'latest-production-review.json')));
 const source=git('ls-files','--cached','--others','--exclude-standard').split(/\r?\n/).filter(Boolean).sort().map(file=>({file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
 if(hash(JSON.stringify(source))!==review.sourceSha256)throw Error('Regenerate the production review for this exact source first.');
 const pointer=JSON.parse(fs.readFileSync(path.join(folder,'production-review-secrets.json'))),runtime=JSON.parse(v.get(pointer.file.replace(/\.aesgcm$/,'')));
 const values={VITE_APP_ENV:'production',VITE_SUPABASE_URL:runtime.SUPABASE_URL,VITE_SUPABASE_PUBLIC_KEY:runtime.SUPABASE_PUBLIC_KEY,VITE_MOBILE_BORROWER:'true',VITE_HOSTED_SERVICES_ENABLED:'true',VITE_RELEASE_ACCESS_ENABLED:'true',VITE_ALLOW_DEMO:'false',VITE_STAGING_READ_ONLY:'false',...runtime};
 if(runtime.APP_ORIGIN!=='https://loanledgerph.ronwaldo.com'||runtime.SUPABASE_URL!=='https://ckbpdrucyogsjatnmvvu.supabase.co'||runtime.PAWCHEEBELS_AI_ENABLED!=='false')throw Error('Unexpected production configuration.');
 require('../../server/runtime-config.cjs')(runtime);
 const caCheck=JSON.parse(fs.readFileSync(path.join(folder,'production-ca-check.json')));
 if(caCheck.project!=='ckbpdrucyogsjatnmvvu'||!caCheck.tlsVerified||caCheck.caSha256!==hash(runtime.DATABASE_CA_CERT)||Date.now()-Date.parse(caCheck.checkedAt)>86400000)throw Error('A current read-only certificate check is required.');
 if(Buffer.byteLength(JSON.stringify(values))>48000)throw Error('Configuration exceeds the review budget.');
 const sensitive=new Set(['SUPABASE_SERVICE_KEY','DATABASE_URL','LOGIN_CODE_SECRET','NOTIFICATION_WORKER_SECRET']);
 const settings=Object.entries(values).map(([key,value])=>({key,value,type:sensitive.has(key)?'secret':'config'}));
 const state=productionState(),conflicts=state.envs.filter(x=>Object.hasOwn(values,x.key));
 const storedPlan=path.join(folder,'production-staging-plan.json'),apply=process.argv.indexOf('--apply-approved-plan');
 if(apply<0){
  if(conflicts.length)throw Error('Proposed production variable names already exist; compare privately before changing them.');
  const protectedConfiguration=v.put('production-staging-configuration-'+Date.now(),JSON.stringify(settings));
  const plan={preparedAt:new Date().toISOString(),commit,tree,project,team,existingDeployment,origin:runtime.APP_ORIGIN,databaseProject:'ckbpdrucyogsjatnmvvu',candidateSha256:review.candidateSha256,clientInventorySha256:review.buildSha256,sourceInventorySha256:review.sourceSha256,configurationBytes:Buffer.byteLength(JSON.stringify(values)),variables:settings.map(({key,type})=>({key,type,target:'production'})),preservedProductionVariableNames:state.envs.map(x=>x.key).sort(),protectedConfiguration:protectedConfiguration.file,operations:['Add the reviewed missing production-scoped variables without overwriting existing variables.','Build a production-target deployment with --skip-domain and retain Vercel deployment protection.'],excluded:['No database migration or Auth/worker configuration changes.','No domain promotion, GitHub main merge or borrower enrollment.','No support SMTP installation, external email or AI provider requests.']};
  plan.planSha256=hash(JSON.stringify(plan));fs.writeFileSync(storedPlan,JSON.stringify(plan,null,2));console.log(JSON.stringify({...plan,protectedConfiguration:'encrypted local evidence'}));return;
 }
 const plan=JSON.parse(fs.readFileSync(storedPlan)),approved=process.argv[apply+1],{planSha256,...unsigned}=plan;
 if(!approved||approved!==planSha256||hash(JSON.stringify(unsigned))!==planSha256||plan.commit!==commit||plan.tree!==tree)throw Error('The exact owner-approved plan and source are required.');
 if(conflicts.length)throw Error('Production variables changed after review; no overwrites are allowed.');
 const approvedSettings=JSON.parse(v.get(plan.protectedConfiguration.replace(/\.aesgcm$/,'')));
 if(JSON.stringify(approvedSettings)!==JSON.stringify(settings))throw Error('Protected configuration changed after review.');
 applying=true;const added=[];for(const item of approvedSettings){run(['env','add',item.key,'production','--type',item.type,'--yes','--project',project],item.value);added.push(item.key);fs.writeFileSync(path.join(folder,'production-staging-progress.json'),JSON.stringify({planSha256,added,productionPromoted:false},null,2));}
 const deployed=run(['deploy','--project',project,'--target=production','--skip-domain','--yes','--archive=tgz','--meta','releaseSource='+commit]);
 const receipt=v.put('production-staging-deployment-'+Date.now(),deployed);productionState();fs.writeFileSync(path.join(folder,'production-staging-result.json'),JSON.stringify({planSha256,commit,receipt:receipt.file,added,productionPromoted:false,productionMigrationApplied:false,pilotEnabled:false},null,2));console.log(JSON.stringify({staged:true,productionPromoted:false,productionMigrationApplied:false,pilotEnabled:false,protectedReceipt:receipt.file}));
 }catch(e){if(e.privateDiagnostic)v.put('production-staging-error-'+Date.now(),e.privateDiagnostic);console.error(e.message);if(applying)console.error('Stop and review retained progress before retrying; existing variables will not be overwritten.');process.exitCode=1;}finally{v.close();}}
if(require.main===module)main();
