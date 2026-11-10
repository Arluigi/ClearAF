import type { LaunchQuestion } from '../types/api';

export function formatIntakeV2Answer(value:unknown,question?:LaunchQuestion):string {
  if(value===null||value===undefined)return 'Not provided';
  if(typeof value==='boolean')return value?'Confirmed':'Not confirmed';
  if(typeof value==='string')return question?.options.find(option=>option.id===value)?.label??value;
  if(Array.isArray(value))return value.map(item=>formatIntakeV2Answer(item,question)).join('\n');
  if(typeof value==='object')return Object.entries(value).map(([key,field])=>{
    if(key==='treatmentId')return question?.options.find(option=>option.id===field)?.label??String(field);
    const child=question?.fields.find(item=>item.id===key);
    return `${child?.prompt??key}: ${formatIntakeV2Answer(field,child)}`;
  }).join('\n');
  return String(value);
}
export function positiveIntakeEntries(values:Record<string,unknown>):[string,unknown][] {
  return Object.entries(values).filter(([,value])=>{
    if(value===null||value===undefined||value===false||value==='')return false;
    if(Array.isArray(value))return value.length>0&&!value.every(item=>item==='none');
    return true;
  });
}
