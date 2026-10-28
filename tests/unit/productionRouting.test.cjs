const {test}=require('node:test'),assert=require('node:assert/strict'),config=require('../../vercel.json');
test('production aliases use the canonical service origin without matching preview hosts',()=>{
 const hosts=config.redirects.map(r=>r.has[0].value);for(const host of ['support.ronwaldo.com','transactions-ledger-ph.vercel.app','www.loanledgerph.ronwaldo.com'])assert.ok(hosts.includes(host));
 assert.ok(!hosts.includes('loanledgerph.ronwaldo.com'));assert.ok(!hosts.some(h=>h.includes('*')));
 for(const r of config.redirects){assert.equal(r.source,'/:path*');assert.equal(r.destination,'https://loanledgerph.ronwaldo.com/:path*');assert.equal(r.has[0].type,'host');assert.equal(r.permanent,false);}
 assert.ok(config.rewrites.find(r=>r.source==='/api/:path*'&&r.destination.includes('__route')));
});
