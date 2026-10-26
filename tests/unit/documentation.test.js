import {test} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import process from 'node:process'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {parseDocumentation,filterDocumentation,legalMarkdown,safeDocumentationLink,documentationExport} from '../../src/lib/documentation.js'
const require=createRequire(import.meta.url),{inventory,captureSources}=require('../../tools/documentation-inventory.cjs')
const read=p=>fs.readFileSync(p,'utf8'),legal=JSON.parse(read('public/legal-content.json'))
test('all fourteen requested documents exist and the route is admin protected in both navigations',()=>{
 const registry=read('src/data/documentation.js'),ids=[...registry.matchAll(/^ \['([^']+)'/gm)].map(m=>m[1]);assert.equal(ids.length,14);assert.equal(new Set(ids).size,14)
 for(const file of ['PRD','user-flow','Architecture','SRS','BRD','SDD','TDD','Guidelines','Design-System','UIRD','Document-Management','Database-Storage'])assert.ok(read('docs/project/'+file+'.md').length>1000,file)
 assert.match(read('src/App.jsx'),/path="\/admin\/documentation" element={<Protected role="admin"><Documentation/)
 for(const file of ['src/components/AppShell.jsx','src/components/admin/workspaceNavigation.js'])assert.ok(read(file).includes("to: '/admin/documentation'"))
})
test('reference renderer parses tables, lists and diagrams without accepting raw executable HTML',()=>{
 const blocks=parseDocumentation('# Heading\n\n[diagram:payment]\n\n| A | B |\n| --- | --- |\n| one | two |\n\n1. Review\n2. Confirm\n\n<script>alert(1)</script>');assert.equal(blocks.find(b=>b.type==='table').rows[0][1],'two');assert.equal(blocks.find(b=>b.type==='list').ordered,true);assert.equal(blocks.find(b=>b.type==='diagram').id,'payment');assert.equal(blocks.at(-1).type,'paragraph')
 for(const href of ['javascript:alert(1)','data:text/html,x','//untrusted.test','file:///secret'])assert.equal(safeDocumentationLink(href),false)
 assert.equal(safeDocumentationLink('/privacy'),true);assert.equal(safeDocumentationLink('https://github.com/ronwaldoayyad-ai/TransactionsLedgerPH'),true)
})
test('policies use every current canonical section and are not rewritten by documentation',()=>{
 for(const [key,title]of [['privacy','Privacy Policy'],['terms','Terms & Conditions']]){const md=legalMarkdown(title,legal[key],legal.updated);for(const section of legal[key]){assert.ok(md.includes(section.title));if(section.text)assert.ok(md.includes(section.text));for(const item of section.items||[])assert.ok(md.includes(item));for(const p of section.paragraphs||[])assert.ok(md.includes(p))}}
 const docs=read('src/data/documentation.js');assert.ok(docs.includes("import legal from '../../public/legal-content.json'"))
})
test('search finds schema names and export retains build context, legal text and schema columns',()=>{
 const sections=[{id:'schema',title:'Database',summary:'Reference',markdown:'# Database\n\n[diagram:database]'},{id:'privacy',title:'Privacy',summary:'Policy',markdown:legalMarkdown('Privacy',legal.privacy,legal.updated)}],data=inventory(process.cwd());assert.equal(filterDocumentation(sections,'payment_allocations',{schema:JSON.stringify(data.schema)})[0].id,'schema');assert.equal(filterDocumentation(sections,'not-a-real-word').length,0)
 const out=documentationExport(sections,data,{database:{nodes:[{id:'a',label:['profiles']},{id:'b',label:['loans']}],edges:[['a','b']]}});assert.ok(out.includes(data.fingerprint));assert.ok(out.includes('payment_allocations'));assert.ok(out.includes('archived_at'));assert.ok(out.includes('~~~mermaid'));assert.ok(out.includes(legal.privacy[0].text));assert.ok(out.includes('payment-proofs'))
})
test('build inventory reflects the current routes, source tokens and metadata without reading environment values',()=>{
 assert.deepEqual(captureSources(process.cwd()),JSON.parse(read('docs/project/source-catalog.json')),'Refresh the excluded-source metadata catalog after migration, test or configuration-name changes')
 const data=inventory(process.cwd());assert.ok(data.routes.includes('/admin/documentation'));assert.ok(data.borrowerPages.includes('history'));assert.ok(data.adminColors.some(c=>c.name==='navy-800'&&c.value==='#1e3a8a'));assert.ok(data.schema.tables.every(t=>Array.isArray(t.columns)&&typeof t.rls==='boolean'));assert.ok(data.schema.storage_buckets.some(b=>b.name==='payment-proofs'&&!b.public));assert.match(data.fingerprint,/^[a-f0-9]{64}$/);assert.ok(data.envNames.every(name=>/^[A-Z][A-Z0-9_]+$/.test(name)));assert.equal(data.schema.tables.some(t=>'rows'in t),false)
})

test('a hosted package without excluded tests, migrations or env examples retains the exact source inventory',t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'loanledger-doc-package-'))
 t.after(()=>{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(temp,{recursive:true,force:true})})
 for(const dir of ['src','server','docs/project','tools'])fs.cpSync(dir,path.join(temp,dir),{recursive:true})
 fs.mkdirSync(path.join(temp,'public'))
 for(const file of fs.readdirSync('public').filter(n=>/\.(html|js|css|json)$/.test(n)))fs.copyFileSync('public/'+file,path.join(temp,'public',file))
 for(const file of ['package.json','package-lock.json','vite.config.js','vercel.json'])fs.copyFileSync(file,path.join(temp,file))
 const full=inventory(process.cwd()),packaged=inventory(temp)
 for(const key of ['fingerprint','sourceFileCount','migrations','migrationsFingerprint','unitFiles','integrationFiles','envNames'])assert.deepEqual(packaged[key],full[key],key)
})
