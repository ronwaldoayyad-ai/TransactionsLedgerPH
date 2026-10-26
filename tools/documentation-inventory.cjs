const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
function inventory(root){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
 const catalog=JSON.parse(read('docs/project/source-catalog.json'));
 const sourceFiles=[...walk('src'),...walk('server'),...walk('docs/project'),...walk('tools'),'package.json','package-lock.json','vite.config.js','vercel.json',...fs.readdirSync(path.join(root,'public')).filter(n=>/\.(html|js|css|json)$/.test(n)).map(n=>'public/'+n)].sort();
 const excludedFiles=Object.entries(catalog.files).map(([p,digest])=>[p,fs.existsSync(path.join(root,p))?hash(read(p)):digest]);
 const fingerprint=hash([...sourceFiles.map(p=>[p,hash(read(p))]),...excludedFiles].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([p,digest])=>p+'\0'+digest).join('\n'));
 const routes=[...read('src/App.jsx').matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]).filter(p=>p!=='*');
 const borrowerMatch=read('public/borrower-v4.12.24.html').match(/let pages=\{([^;]+)\};let screenContent/);
 const borrowerPages=borrowerMatch?borrowerMatch[1].split(',').map(s=>s.split(':')[0].trim()).filter(s=>/^[a-zA-Z]+$/.test(s)):[];
 const migrations=excludedFiles.filter(([p])=>p.startsWith('supabase/migrations/')&&p.endsWith('.sql')).sort(([a],[b])=>a<b?-1:a>b?1:0);
 const schema=JSON.parse(read('docs/project/schema-catalog.json'));
 const adminColors=[...read('src/index.css').matchAll(/--color-([\w-]+):\s*(#[\da-f]+)/gi)].map(m=>({name:m[1],value:m[2]}));
 const borrowerColors={};for(const block of read('public/borrower-v4.12.24.html').matchAll(/:root\s*\{([^}]+)\}/g))for(const m of block[1].matchAll(/--(ink|muted|blue|glass|line|shadow|surface|soft):([^;]+)/g))borrowerColors[m[1]]=m[2].trim();
 const migrationsFingerprint=hash(migrations.map(([p,digest])=>p+'\0'+digest).join('\n'));
 const envNames=catalog.envNames;
 let sourceRef=process.env.VERCEL_GIT_COMMIT_SHA;try{sourceRef ||= cp.execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{/* Packaged deployments have no Git directory. */}
 const suites=folder=>excludedFiles.filter(([p])=>p.startsWith(folder+'/')&&/\.test\.[cm]?js$/.test(p)).map(([p])=>path.basename(p));
 return {generatedAt:new Date().toISOString(),sourceRef:sourceRef||'source package',fingerprint,sourceFileCount:sourceFiles.length+excludedFiles.length,routes,borrowerPages,migrations:migrations.map(([p])=>path.basename(p)),migrationsFingerprint,schema,adminColors,borrowerColors,envNames,packages:JSON.parse(read('package.json')).dependencies,unitFiles:suites('tests/unit'),integrationFiles:suites('tests/integration')};
}
function captureSources(root){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8'),walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
 const files=[...walk('supabase/migrations'),...walk('tests/unit'),...walk('tests/integration'),'.env.example','.env.hosted.example'].sort();
 return {files:Object.fromEntries(files.map(p=>[p,crypto.createHash('sha256').update(read(p)).digest('hex')])),envNames:[...new Set(['.env.example','.env.hosted.example'].flatMap(p=>[...read(p).matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m=>m[1])))].sort()};
}
if(require.main===module&&process.argv[2]==='--capture')fs.writeFileSync(path.join(process.cwd(),'docs/project/source-catalog.json'),JSON.stringify(captureSources(process.cwd()),null,2)+'\n');
module.exports={inventory,captureSources};
