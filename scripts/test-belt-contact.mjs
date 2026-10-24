import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:['world','spin','model','freeBelt','beltContact','gearContact','sim','save'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const context={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,context);const a=context.module.exports;
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function fixture(loop=false,motor=false){
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
 if(loop){
  a.addFreeBelt(w,[{x:400,y:100},{x:900,y:100},{x:900,y:400},{x:400,y:400}]);
  a.addPlacedGear(w,500,133,28,motor?92.4:0,{motorKind:motor?'motor':'follower'});
  a.addPlacedGear(w,700,133,28,0,{motorKind:'follower'});a.driveFreeBelts(w,0);
 }else{
  a.addPlacedBelt(w,300,350,700,350);a.addPlacedGear(w,300,308,28,motor?92.4:0,{motorKind:motor?'motor':'follower'});
 }
 a.solveConfiguredTransmission(w,0);
 const s=w.segments.find(s=>loop?s.freeBelt!==undefined:!!s.belt);
 const body=a.beltContactBody(w,loop?`free:${s.freeBelt}`:`belt:${s.belt}`);
 assert.ok(body);return{w,s,body};
}
for(const loop of [false,true]){
 const {w,s,body}=fixture(loop),claimed=new Set(),initial=100;
 const effectiveMass=body.network.inertia/body.ratio**2;
 const result=a.beltFriction(w,s,initial,100,1,1/60,claimed);
 assert.ok(body.speed()>0);assert.ok(result<initial);
 near(a.BALL_MASS*result+effectiveMass*body.speed(),a.BALL_MASS*initial);
 assert.ok(.5*a.BALL_MASS*result**2+.5*effectiveMass*body.speed()**2<=.5*a.BALL_MASS*initial**2);
 const before=body.speed();near(a.beltFriction(w,s,result,100,1,1/60,claimed),result);near(body.speed(),before);
 const noContact=a.beltFriction(w,s,result,0,1,1/60,new Set());near(noContact,result);near(body.speed(),before);
 const cap=a.beltFriction(w,s,10000,.01,1,1/60,new Set());near(10000-cap,a.BELT_CONTACT_FRICTION*.01/a.BALL_MASS);
 console.log('PASS momentum/energy/stationary backdrive/seam dedup/friction limit',loop?'free belt':'crawler');
}
{
 const {w,s,body}=fixture(false,true);for(let i=0;i<600;i++)a.solveConfiguredTransmission(w,1/60);
 const before=body.speed(),vt=a.beltFriction(w,s,0,100,1,1/60,new Set());
 assert.ok(vt*before>0);assert.ok(Math.abs(body.speed())<Math.abs(before));
 console.log('PASS motor-backed contact receives opposite impulse (no rating changes)');
}
{
 const results=[];
 for(const dt of [1/30,1/60,1/120]){
  const {w,s,body}=fixture();let velocity=100;
  for(let i=0;i<Math.round(1/dt);i++)velocity=a.beltFriction(w,s,velocity,980*dt,1,dt,new Set());
  results.push([velocity,body.speed()]);
 }
 for(const r of results){near(r[0],results[0][0]);near(r[1],results[0][1]);}
 console.log('PASS isolated contact 30/60/120fps',results);
}
{
 const {w,s,body}=fixture();const claimed=new Set();a.beltFriction(w,s,100,100,1,1/60,claimed);
 const g=w.gears.find(g=>g.motorKind),radius=g.r*.92+4.2,offset=14;
 const p={x:g.x+offset,y:g.y-Math.sqrt(radius**2-offset**2)+.01,vx:0,vy:180,r:4.2};
 const before=body.speed();a.collideIndependentFollower(w,p,g,claimed);near(body.speed(),before);
 console.log('PASS belt/gear shared-network impulse dedup');
}
for(const loop of [false,true]){
 const {w}=fixture(loop);const p={id:w.nextId++,kind:'grain',x:loop?600:500,y:loop?95.9:331.9,vx:100,vy:0,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0};w.particles=[p];
 for(let i=0;i<12;i++)a.updateWorld(w,1/120);
 const b=loop?w.freeBelts[0]:w.belts[0];assert.ok(Math.abs(b.speed)>0);assert.ok(w.particles.includes(p));
 console.log('PASS actual updateWorld ball drives',loop?'free belt':'crawler',b.speed);
}
// Diagnostic only: retain the old suite's distance thresholds unchanged.
// Motor/load tuning is explicitly deferred to stage B.
for(const slope of [false,true]){
 const {w}=fixture(true);w.gears=[];w.segments=[];w.freeBelts=[];
 const top=x=>slope?200-(x-300)/4:150;
 a.addFreeBelt(w,[{x:300,y:top(300)},{x:900,y:top(900)},{x:900,y:350},{x:300,y:350}]);
 for(const [x,kind] of [[420,'motor'],[740,'follower']]){
  const snap=a.freeBeltSnap(w,{x,y:top(x)+25},18);
  a.addPlacedGear(w,snap.x,snap.y,18,kind==='motor'?a.placedGearDrive(18,1,5):0,{motorKind:kind});
 }
 const p={id:w.nextId++,kind:'other',x:500,y:top(500)-5,vx:0,vy:0,r:5,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0};w.particles=[p];
 for(let i=0;i<90;i++)a.updateWorld(w,1/60);
 console.log('MEASURE old transport fixture',slope?'incline':'horizontal',{x:p.x,y:p.y,beltSpeed:w.freeBelts[0].speed});
}
