const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
function inventory(root){
 const read=p=>fs.readFileSync(path.join(root,p),'utf8'),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const walk=dir=>fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+'/'+e.name):[dir+'/'+e.name]);
 const sourceFiles=[...walk('src'),...walk('server'),...walk('docs/project'),...walk('supabase/migrations'),...walk('tests/unit'),...walk('tests/integration'),...walk('tools'),'package.json','package-lock.json','vite.config.js','vercel.json',...fs.readdirSync(path.join(root,'public')).filter(n=>/\.(html|js|css|json)$/.test(n)).map(n=>'public/'+n)].sort();
 const fingerprint=hash(sourceFiles.map(p=>p+'\0'+hash(read(p))).join('\n'));
 const routes=[...read('src/App.jsx').matchAll(/<Route path="([^"]+)"/g)].map(m=>m[1]).filter(p=>p!=='*');
 const borrowerMatch=read('public/borrower-v4.12.24.html').match(/let pages=\{([^;]+)\};let screenContent/);
 const borrowerPages=borrowerMatch?borrowerMatch[1].split(',').map(s=>s.split(':')[0].trim()).filter(s=>/^[a-zA-Z]+$/.test(s)):[];
 const migrations=walk('supabase/migrations').filter(p=>p.endsWith('.sql')).sort();
 const schema=JSON.parse(read('docs/project/schema-catalog.json'));
 const adminColors=[...read('src/index.css').matchAll(/--color-([\w-]+):\s*(#[\da-f]+)/gi)].map(m=>({name:m[1],value:m[2]}));
 const borrowerColors={};for(const block of read('public/borrower-v4.12.24.html').matchAll(/:root\s*\{([^}]+)\}/g))for(const m of block[1].matchAll(/--(ink|muted|blue|glass|line|shadow|surface|soft):([^;]+)/g))borrowerColors[m[1]]=m[2].trim();
 const migrationsFingerprint=hash(migrations.map(p=>p+'\0'+hash(read(p))).join('\n'));
 const envNames=[...new Set(['.env.example','.env.hosted.example'].filter(p=>fs.existsSync(path.join(root,p))).flatMap(p=>[...read(p).matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map(m=>m[1])))].sort();
 let sourceRef=process.env.VERCEL_GIT_COMMIT_SHA;try{sourceRef ||= cp.execFileSync('git',['rev-parse','--short=12','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{/* Packaged deployments have no Git directory. */}
 return {generatedAt:new Date().toISOString(),sourceRef:sourceRef||'source package',fingerprint,sourceFileCount:sourceFiles.length,routes,borrowerPages,migrations:migrations.map(p=>path.basename(p)),migrationsFingerprint,schema,adminColors,borrowerColors,envNames,packages:JSON.parse(read('package.json')).dependencies,unitFiles:walk('tests/unit').filter(p=>/\.test\.[cm]?js$/.test(p)).map(p=>path.basename(p)),integrationFiles:walk('tests/integration').filter(p=>/\.test\.[cm]?js$/.test(p)).map(p=>path.basename(p))};
}
module.exports={inventory};
