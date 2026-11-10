import test from 'node:test';
import assert from 'node:assert/strict';
import { formatIntakeV2Answer, positiveIntakeEntries } from '../src/lib/intake-v2';
const question={id:'C1',prompt:'Treatments',kind:'repeat' as const,required:true,showWhen:[],options:[{id:'retinoid',label:'Prescription retinoid'}],fields:[{id:'duration',prompt:'How long?',kind:'choice' as const,required:true,showWhen:[],options:[{id:'over_6_months',label:'More than 6 months'}],fields:[]}]};
test('treatment history uses versioned labels and retains narrative in full',()=>{
 const detail='A detailed patient story. '.repeat(400);
 const result=formatIntakeV2Answer([{treatmentId:'retinoid',duration:'over_6_months',details:detail}],question);
 assert.ok(result.includes('Prescription retinoid'));
 assert.ok(result.includes('More than 6 months'));
 assert.ok(result.includes(detail));
});
test('positive summary omits empty negative screens without losing explicit full answers',()=>{
 const answers={D1:['none'],D2:null,D4:['Kidney disease'],E5:'Patient words'};
 assert.deepEqual(positiveIntakeEntries(answers).map(([key])=>key),['D4','E5']);
 assert.equal(formatIntakeV2Answer(answers.D1), 'none');
});
