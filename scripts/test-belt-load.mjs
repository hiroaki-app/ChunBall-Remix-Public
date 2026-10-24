import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:['world','spin','sim','freeBelt','model'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={Math,module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,c);const a=c.module.exports;
function run(slope,count,motors,r=18,dt=1/60,crawler=false){
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
 const axis=x=>slope?400-(x-300)/4:350;
 const top=x=>crawler?axis(x)-14*Math.hypot(1,slope?.25:0):slope?350-(x-300)/4:250;
 if(crawler)a.addPlacedBelt(w,300,axis(300),1100,axis(1100));
 else a.addFreeBelt(w,[{x:300,y:top(300)},{x:1100,y:top(1100)},{x:1100,y:600},{x:300,y:600}]);
 for(const [i,x] of (crawler?[300,1100]:[420,800]).entries()){
  const snap=crawler?{x,y:axis(x)-14-r}:a.freeBeltSnap(w,{x,y:top(x)+r+5},r);assert.ok(snap);
  a.addPlacedGear(w,snap.x,snap.y,r,i<motors?a.placedGearDrive(r,1,5):0,{motorKind:i<motors?'motor':'follower'});
 }
 for(let i=0;i<600;i++){a.solveSpin(w.gears);a.driveFreeBelts(w,1/60);a.applyBelts(w,1/60);a.solveConfiguredTransmission(w,1/60);}
 const speed=()=>crawler?-w.belts[0].speed:w.freeBelts[0].speed;
 const unloaded=speed();
 for(let i=0;i<count;i++){const x=400+i*10;w.particles.push({id:w.nextId++,kind:'grain',x,y:top(x)-4.2,vx:0,vy:0,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0});}
 const ids=w.particles.map(p=>p.id);let sum=0,n=0;
 for(let i=0;i<Math.round(2/dt);i++){a.updateWorld(w,dt);if(i*dt>=1){sum+=speed();n++;}}
 assert.deepEqual(w.particles.map(p=>p.id),ids);
 return {type:crawler?'crawler':'freeBelt',slope,count,motors,r,dt,unloaded:+unloaded.toFixed(2),speed:+(sum/n).toFixed(2),dx:+(w.particles.reduce((s,p,i)=>s+p.x-(400+i*10),0)/count).toFixed(2)};
}
const rows=[];
for(const slope of [false,true])for(const count of [1,5,30,50])for(const motors of [1,2])rows.push(run(slope,count,motors));
console.table(rows);
for(const slope of [false,true]){
 const pick=(count,motors)=>rows.find(r=>r.slope===slope&&r.count===count&&r.motors===motors);
 assert.ok(pick(30,1).speed<pick(1,1).speed,'many balls must reduce speed');
 assert.ok(pick(30,2).speed>pick(30,1).speed,'additional motor must improve loaded speed');
}
const small=run(true,30,1,18),large=run(true,30,1,40);console.log('SIZE COMPARISON',small,large);assert.ok(large.speed>small.speed);
const frames=[1/30,1/60,1/120].map(dt=>run(true,5,1,18,dt));console.log('FRAME COMPARISON',frames);
assert.ok(Math.max(...frames.map(r=>r.speed))-Math.min(...frames.map(r=>r.speed))<3,'loaded frame-rate spread must be bounded');
console.log('PASS load matrix, motor addition, radius output, entity conservation, loaded fps stability');
const crawlers=[];
for(const slope of [false,true])for(const count of [1,5,30,50])for(const motors of [1,2])crawlers.push(run(slope,count,motors,18,1/60,true));
console.table(crawlers);
for(const slope of [false,true]){
 const pick=(count,motors)=>crawlers.find(r=>r.slope===slope&&r.count===count&&r.motors===motors);
 assert.ok(pick(30,1).speed<pick(1,1).speed);
 assert.ok(pick(30,2).speed>pick(30,1).speed);
}
console.log('PASS crawler load/motor-count matrix');
