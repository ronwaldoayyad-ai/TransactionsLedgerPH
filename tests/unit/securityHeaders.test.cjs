const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{generate,sensitiveSources}=require('../../tools/security-headers.cjs');
test('shipped CSP matches the actual inline scripts and confines scripts, frames and network destinations',()=>{
 const expected=generate(process.cwd()),v=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.deepEqual(v.headers,[{source:'/(.*)',headers:expected}]);assert.deepEqual(JSON.parse(fs.readFileSync('server/security-headers.json','utf8')),expected);
 const csp=expected.find(h=>h.key==='Content-Security-Policy').value,script=csp.split('; ').find(p=>p.startsWith('script-src '));assert.match(script,/sha256-/);assert.doesNotMatch(script,/'unsafe-inline'|'unsafe-eval'|https?:\/\/|\*/);assert.match(csp,/frame-ancestors 'self'/);assert.match(csp,/object-src 'none'/);assert.match(csp,/script-src-attr 'unsafe-inline'/);assert.doesNotMatch(csp,/https:\/\/\*/);
 assert.equal(expected.find(h=>h.key==='X-Content-Type-Options').value,'nosniff');assert.equal(expected.find(h=>h.key==='X-Frame-Options').value,'SAMEORIGIN');for(const source of sensitiveSources)assert.ok(v.rewrites.some(r=>r.source===source&&r.destination==='/api?__route=blocked-resource'));
});
test('vendored OCR resources match their pinned hashes and the active PDF parser is patched with evaluation disabled',()=>{
 const manifest=JSON.parse(fs.readFileSync('public/assets/ocr/manifest.json','utf8')),p=JSON.parse(fs.readFileSync('package.json','utf8'));assert.equal(manifest.pdfjsVersion,p.devDependencies['pdfjs-dist']);assert.equal(manifest.pdfjsEvalDisabled,true);
 for(const r of manifest.resources){const b=fs.readFileSync('public/assets/ocr/'+r.name);assert.equal(b.length,r.bytes,r.name);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),r.sha256,r.name);assert.ok(!r.name.endsWith('.map'));}
 assert.match(fs.readFileSync('public/assets/ocr/pdf.min.js','utf8'),/import\('\/assets\/ocr\/pdf.min.mjs'\)/);for(const file of ['public/borrower-v4.12.24.html','public/v41224-mobile-feedback.js'])assert.match(fs.readFileSync(file,'utf8'),/isEvalSupported:false/);
});
