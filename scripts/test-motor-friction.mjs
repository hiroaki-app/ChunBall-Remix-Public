// No browser/repository writes; exercise the production update and save paths.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const b=await build({stdin:{contents:['world','spin','sim','freeBelt','save','gearContact','beltGearContact'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={Math,module:{exports:{}}};vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
function fixture(crawler=false,sign=1) {
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
 if(crawler)a.addPlacedBelt(w,300,350,900,350);
 else {
  a.addFreeBelt(w,[{x:300,y:350},{x:1000,y:350},{x:1000,y:600},{x:300,y:600}]);
  for(const x of [400,850])a.addPlacedGear(w,x,383,28,0,{motorKind:'follower'});
 }
 a.addPlacedGear(w,650,crawler?307.1:317,28,a.placedGearDrive(28,sign,3),{motorKind:'motor',speedLevel:3});
 const g=w.gears.at(-1),belt=crawler?w.belts[0]:w.freeBelts[0];
 const speed=()=>crawler?-belt.speed:belt.speed;
 return {w,g,belt,speed,crawler};
}
function run(f,seconds=2,dt=1/60){for(let i=0;i<Math.round(seconds/dt);i++)a.updateWorld(f.w,dt);}
function balls(f,count){for(let i=0;i<count;i++)f.w.particles.push({id:f.w.nextId++,kind:'grain',x:400+i*10,y:(f.crawler?336:350)-4.2,vx:0,vy:0,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0});}
for(const crawler of [false,true]) {
 const f=fixture(crawler);run(f);assert.equal(a.prepareBeltGearContacts(f.w).length,1);
 assert.ok(f.g.omega>0&&f.speed()< -1,'external motor drives belt in contact direction');
 const prior=f.speed();f.g.drive=-f.g.drive;run(f,6);assert.ok(f.g.omega<0&&f.speed()>1,'motor reversal reverses belt');
 console.log('PASS drive/reverse',crawler?'crawler':'free belt',{forward:prior,reverse:f.speed(),omega:f.g.omega});
 const noContact=fixture(crawler);noContact.g.y-=10;run(noContact);assert.ok(noContact.speed()===0);
 const loaded=fixture(crawler);balls(loaded,30);run(loaded);const unloaded=fixture(crawler);run(unloaded);
 console.log('LOAD',crawler,{unloadedBelt:unloaded.speed(),loadedBelt:loaded.speed(),unloadedMotor:unloaded.g.omega,loadedMotor:loaded.g.omega,slip:Math.abs(loaded.g.omega*28)-Math.abs(loaded.speed())});
 assert.ok(Math.abs(loaded.speed())<Math.abs(unloaded.speed()),'ball load reduces friction-driven belt speed');
 assert.ok(loaded.g.omega<unloaded.g.omega,'belt reaction slows motor');
 assert.ok(Math.abs(loaded.g.omega*28-loaded.speed()*-1)>1,'finite grip slips under load');
 const coast=fixture(crawler);run(coast);const before=coast.speed();coast.g.y-=20;run(coast,1);
 assert.equal(a.prepareBeltGearContacts(coast.w).length,0);assert.ok(Math.abs(coast.speed())<Math.abs(before)&&coast.speed()*before>0,'belt coasts after separation');
 assert.ok(Math.abs(coast.speed()/before-Math.exp(-1.2))<1e-8,'coasting uses existing time-based drag');
 const removed=fixture(crawler);run(removed);const preRemove=removed.speed();a.removeGear(removed.w,removed.g.id);run(removed,1);
 assert.ok(Math.abs(removed.speed()/preRemove-Math.exp(-1.2))<1e-8,'removing the only new-style motor must preserve passive belt momentum');
 console.log('COAST',crawler,{before,afterOneSecond:coast.speed(),afterMotorRemoval:removed.speed()});
 const frames=[1/30,1/60,1/120].map(dt=>{const f=fixture(crawler);balls(f,5);run(f,2,dt);return {dt,motor:f.g.omega,belt:f.speed()};});
 console.log('FPS',crawler,frames);assert.ok(Math.max(...frames.map(v=>v.belt))-Math.min(...frames.map(v=>v.belt))<2);
 // Old and hand-edited motor saves must not acquire the new capability.
 const data=JSON.parse(JSON.stringify(a.captureSaveGame(fixture(crawler).w)));
 assert.equal(data.version,3);const restore=d=>a.loadSaveGame(a.parseSaveGame(d));
 const fresh=restore(data);assert.equal(a.prepareBeltGearContacts(fresh).length,1);
 for(const version of [1,2,3])for(const enabled of [undefined,false,true]) {
  const old=JSON.parse(JSON.stringify(data));old.version=version;
  for(const p of old.placedParts)if(p.type==='gear'){delete p.motorFrictionContact;p.frictionContact=enabled;}
  if(version===1)old.placedParts=old.placedParts.filter(p=>p.type!=='freeBelt');
  const w=restore(old);assert.equal(a.prepareBeltGearContacts(w).length,0);
  const again=restore(JSON.parse(JSON.stringify(a.captureSaveGame(w))));assert.equal(a.prepareBeltGearContacts(again).length,0,'legacy opt-out survives resave');
 }
 const invalid=JSON.parse(JSON.stringify(data));invalid.placedParts.find(p=>p.motorKind==='motor').motorFrictionContact='yes';assert.equal(a.parseSaveGame(invalid),null);
 console.log('PASS separation/coast/legacy v1-v3 including hand-edited true/current v3');
}
{
 const f=fixture();run(f,.2);
 const energy=()=>f.w.gears.reduce((sum,g)=>sum+.5*a.contactInertia(g.r)*g.omega**2,0);
 const before=energy(),omega=f.g.omega,speed=f.belt.speed;
 a.applyBeltGearContacts(f.w,1/60);
 assert.ok(energy()<=before+1e-8,'friction alone cannot add energy');
 assert.ok(f.g.omega<omega&&Math.abs(f.belt.speed)>Math.abs(speed),'equal-opposite contact slows source and accelerates belt');
 console.log('PASS isolated motor-to-belt reaction and energy');
}
{
 const f=fixture();f.g.x=400;f.g.y=383;a.syncFreeBeltContacts(f.w);assert.equal(a.prepareBeltGearContacts(f.w).length,0,'inner roller wins');
 const corner=fixture();corner.g.x=300;assert.equal(a.prepareBeltGearContacts(corner.w).length,0,'endpoint excluded');
 const two=fixture(true);a.addPlacedBelt(two.w,300,264.2,900,264.2);assert.equal(a.prepareBeltGearContacts(two.w).length,0,'multiple surfaces excluded');
 const cap=fixture(true);cap.g.x=257.1;cap.g.y=350;assert.equal(a.prepareBeltGearContacts(cap.w).length,0,'crawler cap excluded');
 console.log('PASS inner roller/endpoints/cap/multiple surface exclusions');
}
{
 // Contact that is already connected through a separate mesh chain: no duplicate impulse.
 const f=fixture(true);
 for(let x=594;x>=314;x-=56)a.addPlacedGear(f.w,x,307.1,28,0,{motorKind:'follower',frictionContact:false});
 assert.equal(a.prepareBeltGearContacts(f.w).length,1,'unambiguous surface contact exists alongside indirect mesh');
 a.solveConfiguredTransmission(f.w,0,true,a.beltGearSourceGears(f.w));
 const body=a.beltContactBody(f.w,`belt:${f.belt.id}`);assert.equal(a.gearContactToken(f.w,f.g),body.network);
 const before=f.w.gears.map(g=>g.omega);a.applyBeltGearContacts(f.w,1/60);assert.deepEqual(f.w.gears.map(g=>g.omega),before);
 console.log('PASS same fixed-network impulse dedup');
}
