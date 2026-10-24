import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:['world','sim','sewer'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,c);const a=c.module.exports;
const w=a.createStage('sewer'),previous=new Map(),entered=new Set(),passed=new Set(),failed=new Set();
let first=null;
for(let frame=0;frame<60*90;frame++){
 a.updateWorld(w,1/60);
 for(const p of w.particles){
  const old=previous.get(p.id);
  if(old&&old.x<720&&p.x>=720&&old.y<400&&p.y<400){
   if(p.y<263+p.r-1||p.y>289-p.r+1){failed.add(p.id);first??={id:p.id,x:p.x,y:p.y};}
   else entered.add(p.id);
  }
  if(entered.has(p.id)&&p.stem>0)passed.add(p.id);
  previous.set(p.id,{x:p.x,y:p.y});
 }
}
console.log({entered:entered.size,passed:passed.size,failed:failed.size,first});
assert.ok(passed.size>20);assert.equal(failed.size,0);
