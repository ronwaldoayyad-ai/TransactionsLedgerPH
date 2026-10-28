const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {seal,open,wrapPortable,unwrapPortable}=require('../../release/option3/recovery-vault.cjs');
test('protected recovery files round trip without embedding their plaintext',()=>{
  const key=crypto.randomBytes(32),plain=Buffer.from('Private synthetic recovery material '+crypto.randomUUID());
  const encrypted=seal(plain,key);assert.deepEqual(open(encrypted,key),plain);assert.ok(!encrypted.includes(plain));
  assert.notDeepEqual(seal(plain,key),encrypted,'Each file must have an independent nonce.');
});

test('portable recovery key works independently of Windows and rejects wrong passphrases',()=>{
 const key=crypto.randomBytes(32),phrase='Synthetic test passphrase '+crypto.randomUUID(),wrapped=wrapPortable(key,phrase);
 assert.deepEqual(unwrapPortable(wrapped,phrase),key);assert.throws(()=>unwrapPortable(wrapped,'incorrect passphrase'));assert.throws(()=>wrapPortable(key,'short'));
 assert.throws(()=>unwrapPortable({...wrapped,kdf:'unbounded-cost'},phrase));
});
test('recovery authentication rejects changed payloads, headers, tags and wrong keys',()=>{
  const key=crypto.randomBytes(32),original=seal(Buffer.from('synthetic recovery'),key);
  for(const index of [0,4,16,original.length-1]){const tampered=Buffer.from(original);tampered[index]^=1;assert.throws(()=>open(tampered,key));}
  assert.throws(()=>open(original,crypto.randomBytes(32)));assert.throws(()=>open(Buffer.from('short'),key));
  assert.throws(()=>seal(Buffer.from('x'),Buffer.alloc(16)));
});
