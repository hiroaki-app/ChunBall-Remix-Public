import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const bundle = await build({ stdin: { contents: ['world','spin','sim','gearContact','model','freeBelt','save'].map(m => `export * from './src/${m}';`).join(''), resolveDir: process.cwd() }, bundle:true, write:false, format:'cjs', platform:'node' });
const c={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,c);const a=c.module.exports;
const setup=()=>{
 const w=a.createStage('free');w.gears=[];w.segments=[];w.belts=[];w.freeBelts=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
 a.addPlacedGear(w,500,300,28,0,{motorKind:'follower'});a.solveConfiguredTransmission(w,0);
 return {w,g:w.gears[0]};
};
const ball=(x,y,vy=180)=>({id:900,kind:'grain',x,y,vx:0,vy,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0});
const energy=(p,g)=>.5*a.BALL_MASS*(p.vx**2+p.vy**2)+.5*a.contactInertia(g.r)*g.omega**2;
for(const offset of [-16,0,16]){
 const {w,g}=setup(),radius=g.r*.92+4.2;
 const p=ball(g.x+offset,g.y-Math.sqrt(radius**2-offset**2)+.01),before=energy(p,g);
 a.collideIndependentFollower(w,p,g);
 assert.ok(offset===0?Math.abs(g.omega)<1e-12:g.omega*offset>0);
 assert.ok(energy(p,g)<=before+1e-8,'contact must not create energy');
 assert.ok(p.vy<180,'ball receives reaction');
 const omega=g.omega;
 for(let i=0;i<60;i++){a.solveSpin(w.gears);a.solveConfiguredTransmission(w,1/60);}
 assert.ok(Math.abs(g.omega-omega*Math.exp(-1.2))<1e-8,'coasting survives legacy solveSpin');
 for(let i=0;i<1200;i++){a.solveSpin(w.gears);a.solveConfiguredTransmission(w,1/60);}
 assert.equal(g.omega,0);
 console.log('PASS offset',offset,'initial omega',omega);
}
const hit=speed=>{const {w,g}=setup();const p=ball(516,275,speed);a.collideIndependentFollower(w,p,g);return g.omega;};
assert.ok(hit(360)>hit(180));
{
 const {w,g}=setup();
 a.collideIndependentFollower(w,ball(516,275),g);const first=g.omega;
 a.collideIndependentFollower(w,ball(516,275),g);
 assert.ok(g.omega>first,'successive impacts add angular momentum');
}
for(const radius of [18,28,40]){
 const {w,g}=setup();g.r=radius;
 const offset=radius*.5,boundary=radius*.92+4.2;
 const p=ball(500+offset,300-Math.sqrt(boundary**2-offset**2)+.01);
 const before=energy(p,g);a.collideIndependentFollower(w,p,g);
 assert.ok(g.omega>0);assert.ok(energy(p,g)<=before+1e-8);
}
{
 const {w,g}=setup();const p=ball(516,240,0);w.particles=[p];
 for(let i=0;i<45;i++)a.updateWorld(w,1/120);
 assert.ok(g.omega>0,'actual physics loop transfers impact');
 assert.ok(w.particles.includes(p),'same entity retained');
 console.log('PASS updateWorld falling ball',g.omega,p.x,p.y);
}
{
 const {w,g}=setup();a.addPlacedGear(w,556,300,28,0,{motorKind:'follower'});a.solveConfiguredTransmission(w,0);
 assert.equal(a.acceptsBallImpulse(w,g),true,'connected followers accept impulses');
}
{
 const {w}=setup();const p=ball(200,100,0);w.particles=[p];a.updateWorld(w,1/60);
 assert.ok(Math.abs(p.vy-980/60)<.05,'mass does not alter gravity');
}
console.log('isolated follower impulse tests passed');

const near=(x,y)=>assert.ok(Math.abs(x-y)<1e-8,`${x} != ${y}`);
const step=w=>{a.solveSpin(w.gears);a.driveFreeBelts(w,1/60);a.applyBelts(w,1/60);a.solveConfiguredTransmission(w,1/60);};
const impact=(w,g)=>{
 const radius=g.r*.92+4.2,offset=g.r*.5;
 const p=ball(g.x+offset,g.y-Math.sqrt(radius**2-offset**2)+.01,180);
 const before=energyTotal(w,p);a.collideIndependentFollower(w,p,g);
 assert.ok(energyTotal(w,p)<=before+1e-8,'network contact must not create energy');return p;
};
const energyTotal=(w,p)=>.5*a.BALL_MASS*(p.vx**2+p.vy**2)+w.gears.reduce((sum,g)=>sum+.5*a.contactInertia(g.r)*g.omega**2,0);
{
 const {w,g}=setup();impact(w,g);const old=g.omega;
 a.addPlacedGear(w,556,300,28,0,{motorKind:'follower'});step(w);
 near(g.omega,old*.5*Math.exp(-1.2/60));
 console.log('PASS connecting resting inertia does not create kinetic energy');
}
for(const sizes of [[28,28],[28,18,40,28]]){
 const {w,g}=setup();let x=g.x;
 for(let i=1;i<sizes.length;i++){x+=sizes[i-1]+sizes[i];a.addPlacedGear(w,x,300,sizes[i],0,{motorKind:'follower'});}
 step(w);impact(w,g);assert.ok(g.omega>0);assert.ok(g.omega<hit(180),'reflected inertia reduces impact speed');
 for(let i=1;i<w.gears.length;i++)near(w.gears[i].omega,-w.gears[i-1].omega*sizes[i-1]/sizes[i]);
 const old=g.omega;for(let i=0;i<60;i++)step(w);near(g.omega,old*Math.exp(-1.2));
 console.log('PASS passive mesh ratios/inertia/coasting',sizes);
}
{
 const {w,g}=setup();a.addPlacedGear(w,556,300,28,0,{motorKind:'follower'});
 a.addPlacedGear(w,528,300+Math.sqrt(3)*28,28,0,{motorKind:'follower'});
 step(w);impact(w,g);assert.ok(w.gears.every(g=>g.omega===0));
 a.removeGear(w,w.gears[2].id);step(w);impact(w,g);assert.ok(g.omega>0);near(w.gears[1].omega,-g.omega);
 console.log('PASS contradictory mesh stops; removal allows impact restart');
}
{
 const {w}=setup();w.gears=[];
 a.addFreeBelt(w,[{x:400,y:100},{x:900,y:100},{x:900,y:400},{x:400,y:400}]);
 a.addPlacedGear(w,500,133,28,0,{motorKind:'follower'});
 a.addPlacedGear(w,700,145,40,0,{motorKind:'follower'});
 step(w);const [g,h]=w.gears,b=w.freeBelts[0];assert.equal(b.contacts.length,2);
 impact(w,g);assert.ok(Math.abs(b.speed)>0);near(g.omega*28,h.omega*40);
 assert.ok(w.segments.filter(s=>s.freeBelt===b.id).every(s=>s.conveyor===b.speed));
 const travel=b.travel;step(w);assert.notEqual(b.travel,travel);
 const saved=a.parseSaveGame(JSON.parse(JSON.stringify(a.captureSaveGame(w))));assert.ok(saved);
 const restored=a.loadSaveGame(saved);step(restored);const f=restored.gears.find(g=>g.motorKind==='follower');impact(restored,f);
 assert.ok(Math.abs(restored.freeBelts[0].speed)>0);
 a.removeGear(w,h.id);step(w);assert.equal(b.speed,0);impact(w,g);assert.equal(b.speed,0);
 console.log('PASS unpowered free belt immediate surface speed/travel/save/disconnection');
}
{
 const {w}=setup();w.gears=[];a.addPlacedBelt(w,300,350,700,350);
 // A truly unpowered crawler fixture: disable its existing drive explicitly.
 // Production crawler defaults are deliberately unchanged.
 for(const g of w.gears)g.drive=0;
 a.addPlacedGear(w,300,308,28,0,{motorKind:'follower'});
 step(w);const g=w.gears.at(-1),b=w.belts[0];impact(w,g);
 assert.ok(Math.abs(b.speed)>0);
 for(const roller of w.gears.filter(g=>g.belt===b.id))near(roller.omega,-g.omega*28/roller.r);
 assert.ok(w.segments.filter(s=>s.belt===b.id).every(s=>s.conveyor===b.speed));
 const old=b.speed;step(w);near(b.speed,old*Math.exp(-1.2/60));
 console.log('PASS unpowered crawler transmits/coasts; default drive not altered');
}
