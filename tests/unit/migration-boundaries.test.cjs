const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {statements,removeTransactionBoundaries,assertSingleTransaction}=require('../../release/option3/sql-transaction-boundaries.cjs');

test('inline transaction commands are removed without changing the actual SQL',()=>{
  const input="-- title\nBEGIN;select 1;notify pgrst,'reload schema';COMMIT;";
  const result=removeTransactionBoundaries(input);
  assert.equal(result.sql,"-- title\nselect 1;notify pgrst,'reload schema';");
  assert.equal(result.begins,1);assert.equal(result.commits,1);
});
test('quoted bodies, strings, escaped quotes, identifiers and nested comments are preserved',()=>{
  const body=String.raw`create function sample() returns text language plpgsql as $body$
begin
  return 'COMMIT; BEGIN;';
end
$body$;
select E'quote\';commit;', 'it''s;BEGIN;', "commit;", $$COMMIT;$$;
/* outer ; COMMIT; /* nested ; BEGIN; */ end */ select 2; -- COMMIT;
`;
  assert.equal(removeTransactionBoundaries('BEGIN;'+body+'COMMIT;').sql,body);
  assert.equal(statements(body).filter(s=>s.code).length,3);
});
test('comments between transaction keywords do not conceal boundaries',()=>{
  const r=removeTransactionBoundaries('BEGIN /* a */ TRANSACTION;select 1;COMMIT -- b\n WORK;');
  assert.equal(r.sql,'select 1;');
});
test('unsafe or unbalanced transaction controls fail closed',()=>{
  for(const sql of ['COMMIT;','BEGIN;select 1;','BEGIN;BEGIN;COMMIT;COMMIT;','BEGIN;select 1;COMMIT AND CHAIN;','START TRANSACTION;select 1;COMMIT;','BEGIN;ROLLBACK;','SAVEPOINT a;','PREPARE TRANSACTION \'x\';'])assert.throws(()=>removeTransactionBoundaries(sql));
  for(const sql of ["select 'broken",'/* broken','select $body$broken','select "broken'])assert.throws(()=>statements(sql));
});
test('generated candidates reject internal transaction controls and incompatible commands',()=>{
  assert.equal(assertSingleTransaction('BEGIN;select 1;COMMIT;').length,3);
  for(const sql of ['select 1;','BEGIN;select 1;COMMIT;select 2;COMMIT;','BEGIN;SAVEPOINT a;COMMIT;','BEGIN;CREATE INDEX CONCURRENTLY x on t(id);COMMIT;','BEGIN;VACUUM;COMMIT;'])assert.throws(()=>assertSingleTransaction(sql));
});
test('the exact reviewed candidate has only its intended enclosing transaction',()=>{
  const root=path.resolve(__dirname,'../..');
  const candidate=fs.readFileSync(path.join(root,'release/option3/forward-candidate.sql'),'utf8');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'release/option3/manifest.json')));
  assertSingleTransaction(candidate);
  assert.equal(manifest.transaction_boundaries.length,manifest.sources.length);
  assert.ok(manifest.transaction_boundaries.reduce((sum,s)=>sum+s.commits,0)>26);
});
