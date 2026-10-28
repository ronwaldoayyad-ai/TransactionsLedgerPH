import {test} from 'node:test'
import assert from 'node:assert/strict'
import {parseCSV,spreadsheetSafeCSV} from '../../src/lib/csv.js'
test('spreadsheet exports neutralize formulas while preserving financial numbers, quoted text and multiline cells',()=>{
 const csv='Description,Amount\n"=HYPERLINK(""https://example.invalid"",""click"")",-100.25\n"Safe, quoted",1000.00\n@SUM(1),+12.00\n"line\nbreak",0.00';const out=parseCSV(spreadsheetSafeCSV(csv));assert.equal(out.rows[0][0][0],"'");assert.equal(out.rows[0][1],'-100.25');assert.equal(out.rows[1][0],'Safe, quoted');assert.equal(out.rows[2][0],"'@SUM(1)");assert.equal(out.rows[2][1],'+12.00');assert.equal(out.rows[3][0],'line\nbreak');
});
