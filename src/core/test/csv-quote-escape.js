import test from 'node:test';
import assert from 'node:assert';
import { parse } from 'csv-parse/browser/esm/sync';

const csv = `Head 1,Head 2,Head 3
Value 1,"Value 2","Value with multiple """
Comment Test #1,Comment Test #2,Comment Test #3`;

test('quote escapes', _=>{
 let array = parse(csv, {bom:true, columns:false, comment:'#',
	comment_no_infix:true, relax_column_count:true});
 assert.deepEqual(array, [
 	['Head 1', 'Head 2', 'Head 3'],
 	['Value 1', 'Value 2', 'Value with multiple "'],
 	['Comment Test #1', 'Comment Test #2', 'Comment Test #3']
 ]);
});
