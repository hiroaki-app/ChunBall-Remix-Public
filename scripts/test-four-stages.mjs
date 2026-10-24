import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const b=await build({stdin:{contents:['world','sim','sandbox','save','freeBelt'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={Math,module:{exports:{}}};vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
for(const stage of ['sewer','free','sandbox','wash']){
 const w=a.createStage(stage);for(let i=0;i<120;i++)a.updateWorld(w,1/60);
 assert.equal(w.stage,stage);
 for(const p of w.particles)assert.ok([p.x,p.y,p.vx,p.vy].every(Number.isFinite));
 for(const g of w.gears)assert.ok([g.x,g.y,g.omega,g.angle].every(Number.isFinite));
 const saved=a.captureSaveGame(w);assert.equal(saved.version,3);
 const parsed=a.parseSaveGame(JSON.parse(JSON.stringify(saved)));assert.ok(parsed);
 const restored=a.loadSaveGame(parsed);assert.equal(restored.stage,stage);
 for(let i=0;i<60;i++)a.updateWorld(restored,1/60);
 console.log('PASS four-stage startup/update/v3 roundtrip',stage);
}
{
 const w=a.createStage('sandbox');assert.equal(w.particles.length,64);
 a.addPlacedGear(w,100,600,18,0,{motorKind:'follower'});
 a.addPlacedBelt(w,900,600,1100,500);
 a.addFreeBelt(w,[{x:50,y:300},{x:200,y:300},{x:200,y:400},{x:50,y:400}]);
 const parts=JSON.stringify(a.captureSaveGame(w).placedParts);
 const original=[...w.particles],ids=new Set(original.map(p=>p.id));
 for(let i=0;i<60;i++)a.updateWorld(w,1/60);
 assert.ok(w.particles.every(p=>p.sleeping),'basket holds before release');
 a.releaseSandboxBasket(w);a.releaseSandboxBasket(w);
 assert.equal(w.particles.length,64);assert.ok(w.particles.every(p=>!p.sleeping));
 let refilled=false;
 for(let i=0;i<600;i++){
  a.updateWorld(w,1/60);assert.ok(w.particles.length<=64);
  for(const p of original)if(!w.particles.includes(p))assert.ok(p.x< -40||p.x>1320||p.y< -40||p.y>780,'only exited entities disappear');
  if(!w.sandbox.released){refilled=true;break;}
 }
 assert.ok(refilled,'all released balls exit and the basket refills');
 assert.equal(w.particles.length,64);assert.ok(w.particles.every(p=>p.sleeping&&!ids.has(p.id)));
 assert.equal(JSON.stringify(a.captureSaveGame(w).placedParts),parts,'refill preserves user parts');
 const secondIds=new Set(w.particles.map(p=>p.id));a.releaseSandboxBasket(w);
 assert.ok(w.particles.every(p=>secondIds.has(p.id)&&!p.sleeping));
 console.log('PASS sandbox 64 release, no duplicate release, bounds-only removal, refill, retained parts and second release');
}
