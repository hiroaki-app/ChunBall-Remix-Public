import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: ['world','spin','freeBelt','save','sim'].map(m => `export * from './src/${m}';`).join(''), resolveDir: process.cwd() }, bundle:true, write:false, format:'cjs', platform:'node' });
const c = {module:{exports:{}}}; vm.runInNewContext(bundle.outputFiles[0].text,c); const a=c.module.exports;
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7, `${x} != ${y}`);
const step=(w,dt=1/60)=>{a.solveSpin(w.gears);a.driveFreeBelts(w,dt);a.applyBelts(w,dt);a.solveConfiguredTransmission(w,dt);};
const tick=w=>{for(let i=0;i<900;i++)step(w);};
const gear=(w,x,y,r=28,kind='motor',sign=1,level=3)=>{a.addPlacedGear(w,x,y,r,kind==='follower'?0:a.placedGearDrive(r,sign,level),{motorKind:kind,...(kind==='motor'?{speedLevel:level}:{})});return w.gears.at(-1);};
for(const r of [18,28,40])for(const sign of [-1,1])for(const level of [1,2,3,4,5]){
 const w=a.createStage('free'),g=gear(w,500,200,r,'motor',sign,level);tick(w);near(g.omega,a.placedGearDrive(r,sign,level)/r);
}
{
 const w=a.createStage('free'),m=gear(w,500,200),f=gear(w,556,200,28,'follower'),g=gear(w,624,200,40,'follower');tick(w);near(f.omega,-m.omega);near(g.omega,m.omega*28/40);
 a.removeGear(w,m.id);tick(w);near(f.omega,0);near(g.omega,0);
}
{
 const w=a.createStage('free'),m=gear(w,500,200),g=gear(w,556,200,28,'motor',-1);tick(w);near(m.omega,3.3);near(g.omega,-3.3);
 g.drive=a.placedGearDrive(28,-1,4);tick(w);near(m.omega,4.125);near(g.omega,-4.125);a.removeGear(w,g.id);tick(w);near(m.omega,3.3);
}
{
 const w=a.createStage('free'),g1=gear(w,500,200,28,'follower'),g2=gear(w,556,200,28,'follower');tick(w);near(g1.omega,0);near(g2.omega,0);
}
{
 const w=a.createStage('free'),m=gear(w,500,200),f=gear(w,556,200,28,'follower'),f2=gear(w,528,200+Math.sqrt(3)*28,28,'follower');tick(w);near(m.omega,0);near(f.omega,0);near(f2.omega,0);
 a.removeGear(w,f2.id);tick(w);near(m.omega,3.3);
}
{
 const w=a.createStage('free');a.addFreeBelt(w,[{x:400,y:100},{x:900,y:100},{x:900,y:400},{x:400,y:400}]);
 const m=gear(w,500,133,28,'motor',-1),f=gear(w,700,355,40,'follower');tick(w);near(w.freeBelts[0].speed,-92.4);near(f.omega,-92.4/40);
 const f2=gear(w,800,123,18,'follower');tick(w);near(w.freeBelts[0].speed,-92.4);
 const other=gear(w,800,367);tick(w);assert.equal(w.freeBelts[0].conflicted,false);assert.ok(Math.abs(m.omega)<0.001);
 a.removeGear(w,other.id);tick(w);near(w.freeBelts[0].speed,-92.4);
 a.removeGear(w,f.id);a.removeGear(w,f2.id);tick(w);near(w.freeBelts[0].speed,0);near(m.omega,-3.3);
}
{
 const w=a.createStage('free');a.addFreeBelt(w,[{x:400,y:100},{x:900,y:100},{x:900,y:400},{x:400,y:400}]);
 const m=gear(w,500,367),f=gear(w,556,367,28,'follower');tick(w);near(w.freeBelts[0].speed,0);assert.equal(w.freeBelts[0].conflicted,true);
 a.removeGear(w,f.id);gear(w,700,367,28,'follower');tick(w);near(w.freeBelts[0].speed,92.4);
 const travel=w.freeBelts[0].travel;step(w);near(w.freeBelts[0].travel-travel,92.4/60);
}
{
 const w=a.createStage('free');a.addPlacedBelt(w,500,400,700,400);const m=gear(w,500,358),f=gear(w,700,346,40,'follower');tick(w);near(f.omega,92.4/40);near(w.belts[0].speed,-92.4);
 a.removeGear(w,m.id);tick(w);near(w.belts[0].speed,0);near(f.omega,0);
}
for(const stage of ['free','sewer']){
 const w=a.createStage(stage);a.solveSpin(w.gears);a.driveFreeBelts(w,1/60);a.applyBelts(w,1/60);const before=w.gears.map(g=>g.omega),speeds=w.belts.map(b=>b.speed);a.solveConfiguredTransmission(w,1/60);assert.deepEqual(w.gears.map(g=>g.omega),before);assert.deepEqual(w.belts.map(b=>b.speed),speeds);
}
{
 const w=a.createStage('free'),m=gear(w,500,200,18,'motor',-1,5),f=gear(w,546,200,28,'follower');
 const saved=a.captureSaveGame(w);assert.equal(saved.version,3);const parsed=a.parseSaveGame(JSON.parse(JSON.stringify(saved)));assert.ok(parsed);const restored=a.loadSaveGame(parsed);tick(restored);
 const motors=restored.gears.filter(g=>g.placed && g.spin==='gear');assert.equal(motors[0].motorKind,'motor');assert.equal(motors[0].speedLevel,5);assert.equal(motors[1].motorKind,'follower');near(motors[0].omega,-8.8);near(motors[1].omega,8.8*18/28);
 const legacy=a.createStage('free');a.addPlacedGear(legacy,500,200,28,-92.4);a.addPlacedGear(legacy,556,200,28,92.4);
 for(const version of [1,2]){const data={...a.captureSaveGame(legacy),version};const p=a.parseSaveGame(JSON.parse(JSON.stringify(data)));assert.ok(p);const loaded=a.loadSaveGame(p);tick(legacy);tick(loaded);assert.deepEqual(loaded.gears.map(g=>g.omega),legacy.gears.map(g=>g.omega));assert.ok(loaded.gears.every(g=>g.motorKind===undefined));}
 const invalid=JSON.parse(JSON.stringify(saved));invalid.placedParts.find(p=>p.motorKind==='follower').drive=100;assert.equal(a.parseSaveGame(invalid),null);
}
for (const slope of [false,true]) {
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
 const top=x=>slope?200-(x-300)/4:150;
 a.addFreeBelt(w,[{x:300,y:top(300)},{x:900,y:top(900)},{x:900,y:350},{x:300,y:350}]);
 for(const [x,kind] of [[420,'motor'],[740,'follower']]){const snap=a.freeBeltSnap(w,{x,y:top(x)+25},18);assert.ok(snap);gear(w,snap.x,snap.y,18,kind,1,5);}
 const p={id:w.nextId++,kind:'other',x:500,y:top(500)-5,vx:0,vy:0,r:5,frozen:false,sleeping:false,sleepTime:0,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0};w.particles.push(p);const y=p.y;
 for(let i=0;i<90;i++)a.updateWorld(w,1/60);
 assert.ok(p.x>580,`new transmission transport x=${p.x}`);if(slope)assert.ok(p.y<y-15);assert.ok(w.particles.includes(p));
}
const makeLoop=()=>{const w=a.createStage('free');a.addFreeBelt(w,[{x:300,y:100},{x:1000,y:100},{x:1000,y:400},{x:300,y:400}]);const m=gear(w,420,133);gear(w,700,367,28,'follower');tick(w);return {w,m,b:w.freeBelts[0]};};
{
 const {w,m,b}=makeLoop(),before=b.speed;
 const high=gear(w,850,133,28,'motor',1,5);step(w);assert.ok(b.speed>before && b.speed<before+5);assert.equal(b.conflicted,false);
 tick(w);near(b.speed,138.6);near(high.omega,m.omega);
 const fast=b.speed;a.removeGear(w,high.id);step(w);assert.ok(b.speed<fast && b.speed>fast-5);tick(w);near(b.speed,92.4);
 const low=gear(w,850,133,28,'motor',1,1);step(w);assert.ok(b.speed<92.4 && b.speed>87);tick(w);near(b.speed,57.75);assert.ok(low.omega>0.825); // back-driven above its own target
 a.removeGear(w,low.id);tick(w);
 const oppose=gear(w,850,133,28,'motor',-1,3);step(w);assert.ok(b.speed>0 && b.speed<92.4);tick(w);assert.ok(Math.abs(b.speed)<0.001);assert.equal(b.conflicted,false);
 oppose.drive=a.placedGearDrive(28,-1,5);tick(w);assert.ok(b.speed<0);a.removeGear(w,oppose.id);tick(w);near(b.speed,92.4);
 console.log('PASS smooth fast/slow addition, back-drive, removal, balanced stop and reversal');
}
{
 const {w,b}=makeLoop();const large=gear(w,850,355,40,'motor',1,5);const before=b.speed;step(w);assert.ok(b.speed>before && b.speed<before+5);tick(w);assert.ok(b.speed>before && b.speed<176);near(large.omega*40,b.speed);
 assert.ok(a.motorCharacteristics(40).maxTorque>a.motorCharacteristics(18).maxTorque);assert.ok(a.motorCharacteristics(40).inertia>a.motorCharacteristics(18).inertia);
}
{
 const speeds=[];for(const dt of [1/30,1/60,1/120]){const w=a.createStage('free'),m=gear(w,500,200,40,'motor',1,5);for(let t=0;t<Math.round(2/dt);t++)step(w,dt);speeds.push(m.omega);}
 assert.ok(Math.max(...speeds)-Math.min(...speeds)<0.003);console.log('PASS frame-rate stability',speeds);
}
{
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
 a.addPlacedBelt(w,300,350,900,350);gear(w,300,318,18,'motor',1,5);gear(w,900,318,18,'follower');tick(w);
 const p={id:w.nextId++,kind:'other',x:500,y:330,vx:0,vy:0,r:5,frozen:false,sleeping:false,sleepTime:0,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0};w.particles.push(p);
 for(let i=0;i<90;i++)a.updateWorld(w,1/60);assert.ok(p.x>570,`crawler transport x=${p.x}`);assert.ok(w.particles.includes(p));console.log('PASS configured crawler actual ball transport');
}
console.log('motor dynamics, transport and v1/v2/v3 save tests passed');
