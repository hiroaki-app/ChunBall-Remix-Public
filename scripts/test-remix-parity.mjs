// Usage: node scripts/test-remix-parity.mjs /path/to/read-only/original
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const baseline=process.argv[2];
if(!baseline)throw new Error('Pass a read-only baseline checkout path');
async function api(root){
 const b=await build({stdin:{contents:['world','sim','sandbox'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:root},bundle:true,write:false,platform:'node',format:'cjs'});
 let seed=12345;const math=Object.create(Math);math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 const c={Math:math,module:{exports:{}}};vm.runInNewContext(b.outputFiles[0].text,c);return c.module.exports;
}
const a=await api(baseline),b=await api(process.cwd());
function snapshot(w){return JSON.stringify({particles:w.particles.map(({headColors,depth,...p})=>p),gears:w.gears,segments:w.segments,belts:w.belts,freeBelts:w.freeBelts,drum:w.drum,phase:w.wash?.phase});}
let failures=0;
for(const stage of ['sewer','free','sandbox','wash'])for(const fps of [30,60,120]){
 const x=a.createStage(stage),y=b.createStage(stage);
 if(stage==='sandbox'){a.releaseSandboxBasket(x);b.releaseSandboxBasket(y);}
 let failed=null;
 for(let i=0;i<fps*12;i++){
  a.updateWorld(x,1/fps);b.updateWorld(y,1/fps);
  if(snapshot(x)!==snapshot(y)){failed=i;break;}
 }
 if(failed!==null){failures++;console.log('DIFFERENCE',stage,fps,'first frame',failed); const p=x.particles.find((p,i)=>JSON.stringify(p)!==JSON.stringify(y.particles[i])); console.log({before:p,after:y.particles.find(q=>q.id===p?.id)});}
 else console.log('PASS exact baseline parity',stage,fps);
}
assert.equal(failures,0,'Non-excluded stages must retain their actual trajectories');
