import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const result=await build({stdin:{contents:['world','spin','freeBelt','save','gearContact','beltGearContact','sim'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={Math,module:{exports:{}}};vm.runInNewContext(result.outputFiles[0].text,c);const a=c.module.exports;
const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-7,`${x} != ${y}`);
function setup(sign=1){
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];w.particles=[];
 a.addFreeBelt(w,[{x:400,y:100},{x:900,y:100},{x:900,y:400},{x:400,y:400}]);
 for(const x of [500,800])a.addPlacedGear(w,x,133,28,a.placedGearDrive(28,sign,3),{motorKind:'motor'});
 for(let i=0;i<600;i++){a.solveSpin(w.gears);a.driveFreeBelts(w,1/60);a.solveConfiguredTransmission(w,1/60);}
 a.addPlacedGear(w,650,67,28,0,{motorKind:'follower'});const gear=w.gears.at(-1);
 a.driveFreeBelts(w,0);a.solveConfiguredTransmission(w,0);a.prepareBeltGearContacts(w);
 return {w,gear,belt:w.freeBelts[0]};
}
const energy=w=>w.gears.reduce((s,g)=>s+.5*a.contactInertia(g.r)*g.omega**2,0);
for(const sign of [1,-1]){
 const {w,gear,belt}=setup(sign),before=belt.speed,e=energy(w);
 assert.equal(a.prepareBeltGearContacts(w).length,1);a.applyBeltGearContacts(w,1/60);
 assert.ok(gear.omega*sign<0);assert.ok(Math.abs(belt.speed)<Math.abs(before));assert.ok(energy(w)<=e+1e-8);
 assert.ok(Math.abs(gear.omega*28-belt.speed)>1,'finite friction allows slip');
 const omega=gear.omega;gear.y-=10;a.prepareBeltGearContacts(w);a.applyBeltGearContacts(w,1/60);near(gear.omega,omega);
 for(let i=0;i<60;i++)a.solveConfiguredTransmission(w,1/60);assert.ok(Math.abs(gear.omega)<Math.abs(omega)&&gear.omega*omega>0);
 console.log('PASS outer contact/reverse/reaction/slip/energy/disconnect/coasting',sign);
}
{
 const {w,gear}=setup();a.addPlacedGear(w,650,11,28,0,{motorKind:'follower'});
 a.solveConfiguredTransmission(w,0);a.prepareBeltGearContacts(w);a.applyBeltGearContacts(w,1/60);
 assert.ok(gear.omega<0);near(w.gears.at(-1).omega,-gear.omega);console.log('PASS mesh transmission without fixed belt connection');
}
{
 const {w,gear}=setup();gear.x=500;gear.y=133;a.syncFreeBeltContacts(w);a.solveConfiguredTransmission(w,0);
 assert.equal(a.prepareBeltGearContacts(w).length,0);console.log('PASS existing roller connection priority');
}
{
 const {w,gear}=setup();gear.x=400;gear.y=67;a.prepareBeltGearContacts(w);assert.equal(a.prepareBeltGearContacts(w).length,0);
 gear.x=650;gear.y=120;a.prepareBeltGearContacts(w);assert.equal(a.prepareBeltGearContacts(w).length,0);console.log('PASS endpoint/inside ambiguity excluded');
}
{
 const {w}=setup();const data=JSON.parse(JSON.stringify(a.captureSaveGame(w)));
 const parsed=a.parseSaveGame(data);assert.ok(parsed);const loaded=a.loadSaveGame(parsed);a.solveConfiguredTransmission(loaded,0);
 assert.equal(a.prepareBeltGearContacts(loaded).length,1);
 for(const version of [1,2,3]){
  const old=JSON.parse(JSON.stringify(data));old.version=version;for(const part of old.placedParts)delete part.frictionContact;
  if(version===1){old.placedParts=old.placedParts.filter(p=>p.type!=='freeBelt');for(const p of old.placedParts)delete p.motorKind;}
  const p=a.parseSaveGame(old);assert.ok(p);const restored=a.loadSaveGame(p);a.solveConfiguredTransmission(restored,0);
  assert.equal(a.prepareBeltGearContacts(restored).length,0);
  const roundtrip=a.parseSaveGame(JSON.parse(JSON.stringify(a.captureSaveGame(restored))));assert.ok(roundtrip);
  const again=a.loadSaveGame(roundtrip);a.solveConfiguredTransmission(again,0);
  assert.equal(a.prepareBeltGearContacts(again).length,0,'legacy friction opt-out must survive re-saving');
 }
 const invalid=JSON.parse(JSON.stringify(data));invalid.placedParts.find(p=>p.type==='gear').frictionContact='yes';assert.equal(a.parseSaveGame(invalid),null);
 console.log('PASS new save restoration and v1/v2/v3 legacy opt-out');
}
{
 const values=[];
 for(const dt of [1/30,1/60,1/120]){const {w,gear,belt}=setup();for(let i=0;i<Math.round(.5/dt);i++)a.applyBeltGearContacts(w,dt);values.push([gear.omega,belt.speed]);}
 for(const v of values){near(v[0],values[0][0]);near(v[1],values[0][1]);}console.log('PASS isolated friction 30/60/120fps',values);
}
{
 const {w}=setup();w.freeBelts=[];w.segments=[];w.gears=[];
 a.addPlacedBelt(w,300,350,900,350);a.addPlacedGear(w,300,308,28,92.4,{motorKind:'motor'});
 a.addPlacedGear(w,600,307.1,28,0,{motorKind:'follower'});const gear=w.gears.at(-1);
 for(let i=0;i<600;i++)a.solveConfiguredTransmission(w,1/60);a.prepareBeltGearContacts(w);
 assert.equal(a.prepareBeltGearContacts(w).length,1);a.applyBeltGearContacts(w,1/60);assert.ok(Math.abs(gear.omega)>0);
console.log('PASS user crawler surface friction');
}
{
 const {w,gear}=setup();w.spawnAcc=-1e6;
 for(let i=0;i<120;i++)a.updateWorld(w,1/60);assert.ok(gear.omega<0);
 for(const g of w.gears)if(g.motorKind==='motor')g.drive=-g.drive;
 for(let i=0;i<600;i++)a.updateWorld(w,1/60);assert.ok(gear.omega>0);
 console.log('PASS actual updateWorld drive and in-place reversal');
}
{
 const values=[];
 for(const dt of [1/30,1/60,1/120]){const {w,gear,belt}=setup();w.spawnAcc=-1e6;for(let i=0;i<Math.round(2/dt);i++)a.updateWorld(w,dt);values.push([gear.omega,belt.speed]);}
 assert.ok(Math.max(...values.map(v=>v[0]))-Math.min(...values.map(v=>v[0]))<.05);
 assert.ok(Math.max(...values.map(v=>v[1]))-Math.min(...values.map(v=>v[1]))<.5);
console.log('PASS full physics 30/60/120fps',values);
}
{
 const {w,gear}=setup();for(const g of w.gears)if(g.motorKind==='motor'){delete g.motorKind;delete g.frictionContact;}
 w.spawnAcc=-1e6;for(let i=0;i<120;i++)a.updateWorld(w,1/60);assert.ok(gear.omega<0);
console.log('PASS new receiver reacts against legacy driven belt source');
}
{
 const {w}=setup();w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];
 a.addPlacedBelt(w,300,350,900,350);a.addPlacedBelt(w,300,264.2,900,264.2);
 a.addPlacedGear(w,600,307.1,28,0,{motorKind:'follower'});
 assert.equal(a.prepareBeltGearContacts(w).length,0);console.log('PASS two-surface ambiguity excluded');
}
