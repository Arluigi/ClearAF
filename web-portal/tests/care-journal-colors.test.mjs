import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
function luminance(hsl) {
  const [h, s, l] = hsl.map((v, i) => v / (i === 0 ? 360 : 100));
  const a = s * Math.min(l, 1-l);
  const rgb = [0,8,4].map(n => { const k = (n+h*12)%12; return l-a*Math.max(-1,Math.min(k-3,9-k,1)); });
  return rgb.map(c => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
}
function contrast(a,b) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
for (const [theme, block] of [['light',css.split('@media')[0]], ['dark',css.split('@media (prefers-color-scheme: dark)')[1]]]) {
  test(`Care Journal ${theme} text, actions and input boundaries meet contrast targets`, () => {
    const values=Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)].map(m=>[m[1],m.slice(2).map(Number)]));
    for(const surface of ['canvas','surface']) for(const text of ['text-primary','text-secondary','action-primary','error']) assert.ok(contrast(values[text],values[surface])>=4.5,`${text}/${surface}`);
    assert.ok(contrast(values['action-primary'],values['action-on-primary'])>=4.5);
    assert.ok(contrast(values.error,values['on-error'])>=4.5);
    assert.ok(contrast(values['text-secondary'],values.surface)>=3);
  });
}
