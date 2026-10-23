import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {assertSingleTransaction} from '../../release/option3/sql-transaction-boundaries.cjs'
test('new fee stale guards use non-retryable HTTP conflicts, not serialization failures',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261023182733_combined_fee_assessment.sql','utf8')
 assertSingleTransaction(sql);assert.doesNotMatch(sql,/errcode\s*=\s*'40001'/i)
 assert.equal((sql.match(/errcode='PT409'/g)||[]).length,2)
 const ui=fs.readFileSync('src/pages/admin/LoanFeeManager.jsx','utf8');assert.match(ui,/uncertain&&e\.code!=='PT409'/);assert.doesNotMatch(ui,/e\.code[!=]+['"]40001/)
})
test('legacy transaction conflict fix is bound to the reviewed function and changes only its exception code',()=>{
 const sql=fs.readFileSync('supabase/migrations/20261023192521_non_retrying_transaction_conflicts.sql','utf8')
 assertSingleTransaction(sql)
 assert.match(sql,/b08993e4da31be7ee7e51e199c83a6a0a5abdedfeb80a876ead63e85bcb7ee39/)
 assert.match(sql,/replace\(definition,'using errcode=''40001''','using errcode=''PT409'''\)/)
 assert.doesNotMatch(sql,/\b(?:update|delete from|insert into)\s+public\./i)
})
