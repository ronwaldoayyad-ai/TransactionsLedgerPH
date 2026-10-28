// Reads configuration only. No link, environment update, deployment or secret rotation.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {vault}=require('./recovery-vault.cjs');
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'.release/recovery-2026-10-22');
const cli=path.resolve(root,'../deployment-tools/node_modules/vercel/dist/index.js');
const project='prj_lFG8NQ36IlahbssDCeLU05eQOBtp',team='team_KNkwRoBk8bClKGsYZxOUWedb';
function command(args){const r=cp.spawnSync(process.execPath,[cli,...args,'--scope','ronwaldoayyad-ais-projects','--non-interactive'],{cwd:root,windowsHide:true,maxBuffer:16777216});if(r.status!==0)throw Object.assign(Error('Configuration read failed; protected diagnostics retained.'),{privateDiagnostic:Buffer.concat([r.stdout||Buffer.alloc(0),r.stderr||Buffer.alloc(0)])});return r.stdout;}
function run(){const v=vault(folder),stamp=Date.now(),files=[];const put=(name,b)=>files.push({name,...v.put('config-'+stamp+'-'+name,b)});
 try{
  const config=fs.readFileSync(path.join(folder,'config-capture/supabase/config.toml'));put('supabase-config.toml',config);
  const projectRaw=command(['api','/v9/projects/'+project+'?teamId='+team,'--method','GET']);put('vercel-project.json',projectRaw);
  const projectData=JSON.parse(projectRaw);if(projectData.id!==project)throw Error('Unexpected deployment project.');
  const envMeta=command(['api','/v10/projects/'+project+'/env?teamId='+team+'&decrypt=false','--method','GET']);put('vercel-env-metadata.json',envMeta);
  const latest=projectData.targets?.production||projectData.latestDeployments?.find(d=>d.target==='production');
  if(latest?.id){const raw=command(['api','/v13/deployments/'+latest.id+'?teamId='+team,'--method','GET']);put('vercel-production-deployment.json',raw);}
  const envFile=path.join(folder,'.env.vercel-production.local');
  command(['env','pull',envFile,'--environment','production','--project',project,'--yes']);
  const env=fs.readFileSync(envFile);put('vercel-production.env',env);fs.unlinkSync(envFile);env.fill(0);
  put('production-database-connection.env',fs.readFileSync(path.join(folder,'.env.production-recovery.local')));
  const manifest=JSON.parse(fs.readFileSync(path.join(folder,'latest-capture.json')));manifest.configurationFiles=files;manifest.configurationCapturedAt=new Date().toISOString();manifest.configurationLimits=['Provider-managed signing secrets, non-exportable environment secrets and external SMTP/provider credentials require separate escrow or documented re-provisioning.'];
  v.put('config-'+stamp+'-combined-manifest.json',JSON.stringify(manifest));fs.writeFileSync(path.join(folder,'latest-capture.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({files:files.length,productionProject:project,productionDeployment:latest?.id||null,productionWrites:0,limits:manifest.configurationLimits}));
 }catch(e){if(e.privateDiagnostic)v.put('config-error-'+stamp,e.privateDiagnostic);console.error(e.message);process.exitCode=1;}finally{v.close();}
}
if(require.main===module)run();
