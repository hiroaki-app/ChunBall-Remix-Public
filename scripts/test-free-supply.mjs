import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const b=await build({stdin:{contents:"export * from './src/world'; export * from './src/free'; export * from './src/sim';",resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={Math,module:{exports:{}}};vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
const w=a.createStage('free');w.particles=[];
for(let i=0;i<50;i++)a.spawnFreeBall(w);
assert.equal(w.particles.length,50);const ids=w.particles.map(p=>p.id);
for(const p of w.particles){p.frozen=true;p.x=200+(p.id%50)*12;p.y=550;}
for(let i=0;i<120;i++)a.updateWorld(w,1/60);
assert.deepEqual(w.particles.map(p=>p.id),ids,'at capacity no spawning or replacement');
const outgoing=w.particles[0];outgoing.x=1321;a.updateWorld(w,1/60);assert.equal(w.particles.length,49);
w.spawnAcc=.7;a.updateWorld(w,1/60);assert.equal(w.particles.length,50);
for(const id of ids.slice(1))assert.ok(w.particles.some(p=>p.id===id),'existing visible balls retained');
console.log('PASS free stage 50 cap, no replacement, bounds removal and replenishment');
