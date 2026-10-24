import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {build} from 'esbuild';
const seconds=Number(process.argv[2]??180),baseline=process.argv.includes('--baseline');
// Example: node scripts/test-long-run.mjs 60 --baseline /path/to/baseline
const root=baseline?process.argv[process.argv.indexOf('--baseline')+1]:process.cwd();
if(!root)throw new Error('--baseline requires a baseline checkout path');
const b=await build({stdin:{contents:['world','sim','freeBelt','save'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:root},bundle:true,write:false,format:'cjs',platform:'node'});
const c={Math,module:{exports:{}}};vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
for(let j=0;j<2;j++)for(let i=0;i<4;i++){
 const x=40+i*300,y=80+j*300;a.addFreeBelt(w,[{x,y},{x:x+240,y},{x:x+240,y:y+160},{x,y:y+160}]);
 for(const px of [x+40,x+200])a.addPlacedGear(w,px,y+23,18,a.placedGearDrive(18,1,3),{motorKind:'motor'});
 for(const py of [y-23,y-59])a.addPlacedGear(w,x+120,py,18,0,{motorKind:'follower'});
}
for(let i=0;i<48;i++)a.addPlacedGear(w,40+(i%12)*100,650+Math.floor(i/12)*12,18,0,{motorKind:'follower'});
w.segments.push({ax:5,ay:695,bx:1275,by:695,conveyor:0,placed:true,draw:true,pass:'all'});
for(let i=0;i<50;i++){const x=70+(i%25)*44,y=i<25?60:360;w.particles.push({id:w.nextId++,kind:'grain',x,y,vx:0,vy:0,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0});}
const dt=1/60,times=[],start=performance.now();let peakOmega=0,peakSpeed=0;
const initialBalls=[...w.particles];
for(let i=0;i<Math.round(seconds/dt);i++){
 const t=performance.now();a.updateWorld(w,dt);times.push(performance.now()-t);
 for(const g of w.gears){assert.ok(Number.isFinite(g.omega)&&Number.isFinite(g.angle));peakOmega=Math.max(peakOmega,Math.abs(g.omega));}
 for(const p of w.particles)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.vx,p.vy)<=641);
 for(const loop of w.freeBelts){assert.ok(Number.isFinite(loop.speed)&&Number.isFinite(loop.travel));peakSpeed=Math.max(peakSpeed,Math.abs(loop.speed));}
 if(i&&i%3600===0)console.log('progress',i*dt,'seconds');
}
times.sort((a,b)=>a-b);assert.ok(peakOmega<100&&peakSpeed<1000,'unbounded acceleration');
const saved=a.parseSaveGame(JSON.parse(JSON.stringify(a.captureSaveGame(w))));assert.ok(saved);
const culled=initialBalls.filter(p=>!w.particles.includes(p));
for(const p of culled)assert.ok(p.x< -40||p.x>1320||p.y< -40||p.y>780,'no interior ball may vanish');
const restored=a.loadSaveGame(saved);for(let i=0;i<60;i++)a.updateWorld(restored,dt);
console.log({baseline,virtualSeconds:seconds,gears:w.gears.length,belts:w.freeBelts.length,ballsInitial:50,ballsFinal:w.particles.length,removedOutsideBounds:culled.map(p=>({id:p.id,x:p.x,y:p.y})),wallSeconds:+((performance.now()-start)/1000).toFixed(2),meanMs:+(times.reduce((s,v)=>s+v,0)/times.length).toFixed(3),p95Ms:+times[Math.floor(times.length*.95)].toFixed(3),peakOmega,peakSpeed});
