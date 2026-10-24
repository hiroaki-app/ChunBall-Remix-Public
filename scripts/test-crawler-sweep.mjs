import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({stdin:{contents:['world','sim','spin','crawlerSweep','freeBelt','beltGearContact'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'test-only-collision-observation',setup(b){b.onLoad({filter:/\/(sim|beltContact)\.ts$/},({path})=>{let s=fs.readFileSync(path,'utf8');if(path.endsWith('/sim.ts'))s+='\nexport {stepPhysics};';else s=s.replace('applyBeltImpulse(world, body, -impulse * tangentProjection);','__countImpulse();applyBeltImpulse(world, body, -impulse * tangentProjection);');return {contents:s,loader:'ts'};});}}]});
let impulseCount=0;
const c={module:{exports:{}},__countImpulse:()=>impulseCount++};vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
function fixture(angle,reverse=false){
 const w=a.createStage('sandbox'),p=w.particles[0];w.particles=[p];
 const u={x:Math.cos(angle),y:Math.sin(angle)},n={x:Math.sin(angle),y:-Math.cos(angle)};
 const A={x:320,y:400},B={x:320+u.x*600,y:400+u.y*600};
 a.addPlacedBelt(w,reverse?B.x:A.x,reverse?B.y:A.y,reverse?A.x:B.x,reverse?A.y:B.y);
 const tops=a.crawlerTops(w);assert.equal(tops.size,1);const top=[...tops.values()][0];
 return {w,p,top,u,n,mid:{x:(A.x+B.x)/2+n.x*14,y:(A.y+B.y)/2+n.y*14}};
}
for(const angle of [0,-.4,.4])for(const reverse of [false,true]){
 const {w,p,top,u,n,mid}=fixture(angle,reverse),at=d=>({x:mid.x+n.x*d,y:mid.y+n.y*d});
 Object.assign(p,at(-12),{vx:-n.x*620,vy:-n.y*620,sleeping:false});
 const hit=a.sweepCrawlerTop(p,at(p.r+.1),top);assert.ok(hit);
 const distance=(hit.x-top.segment.ax)*n.x+(hit.y-top.segment.ay)*n.y;
 assert.ok(Math.abs(distance-(p.r-1e-6))<1e-7);
 assert.equal(a.sweepCrawlerTop(p,at(-10),top),undefined,'already below is not a swept impact');
 p.vx=n.x*620;p.vy=n.y*620;
 assert.equal(a.sweepCrawlerTop(p,at(p.r+.1),top),undefined,'departing/underside approach must not stick');
 p.vx=-n.x*620;p.vy=-n.y*620;Object.assign(p,at(p.r/2));
 assert.equal(a.sweepCrawlerTop(p,at(p.r+.1),top),undefined,'ordinary upper overlap keeps existing response');
 const endpoint={x:top.segment.ax+top.ux*2,y:top.segment.ay+top.uy*2};
 Object.assign(p,{x:endpoint.x-n.x*12,y:endpoint.y-n.y*12});
 assert.equal(a.sweepCrawlerTop(p,{x:endpoint.x+n.x*(p.r+.1),y:endpoint.y+n.y*(p.r+.1)},top),undefined,'caps/roller seam excluded');
 for(const fps of [30,60,120]){
  const f=fixture(angle,reverse);Object.assign(f.p,{x:f.mid.x+n.x*(f.p.r+.1),y:f.mid.y+n.y*(f.p.r+.1),vx:-n.x*620,vy:-n.y*620,sleeping:false});
  const before=f.p.vx**2+f.p.vy**2;a.updateWorld(f.w,1/fps);
  const q=(f.p.x-f.top.segment.ax)*n.x+(f.p.y-f.top.segment.ay)*n.y;
  assert.ok(q>=f.p.r-1e-6,`no upper crossing at ${fps}fps`);
  assert.ok(f.p.vx*n.x+f.p.vy*n.y>0,'one ordinary outward restitution response');
  assert.ok(f.p.vx**2+f.p.vy**2<before,'unpowered impact cannot increase kinetic energy');
 }
 assert.ok(w.particles.includes(p));
}
{
 const f=fixture(-.4);for(const s of f.w.segments)s.placed=false;
 assert.equal(a.crawlerTops(f.w).size,0,'factory surfaces excluded');
 for(const s of f.w.segments){s.placed=true;s.freeBelt=999;}
 assert.equal(a.crawlerTops(f.w).size,0,'free belts excluded');
 const w=a.createStage('sandbox');a.addPlacedBelt(w,600,500,600,200);
 assert.equal(a.crawlerTops(w).size,0,'vertical belt is not an upward supporting surface');
}
console.log('PASS crawler swept top: 620px/s, 30/60/120fps, slopes and endpoint orders, energy/restitution, underside/departure/caps/factory/free exclusions');
{
 const angle=-.4,h=1/120;
 function contactFixture(){const f=fixture(angle);const bottom={x:f.mid.x-f.n.x*(28.9+28),y:f.mid.y-f.n.y*(28.9+28)};
  a.addPlacedGear(f.w,bottom.x,bottom.y,28,0,{motorKind:'follower'});
  a.prepareBeltGearContacts(f.w);a.solveSpin(f.w.gears);a.applyBelts(f.w,0);a.solveConfiguredTransmission(f.w,0,true,a.beltGearSourceGears(f.w));
  Object.assign(f.p,{vx:-f.n.x*620+f.u.x*80,vy:-f.n.y*620+f.u.y*80,sleeping:false});return f;
 }
 const swept=contactFixture();Object.assign(swept.p,{x:swept.mid.x+swept.n.x*(swept.p.r+.1),y:swept.mid.y+swept.n.y*(swept.p.r+.1)});
 const kinetic=f=>.5*(f.p.vx**2+f.p.vy**2)+f.w.gears.reduce((v,g)=>v+.5*a.motorCharacteristics(g.r).inertia*a.MOTOR_CONTACT_UNIT*g.omega*g.omega,0);
 const before=kinetic(swept);impulseCount=0;a.stepPhysics(swept.w,h,a.crawlerTops(swept.w));
 assert.equal(impulseCount,1,'swept contact returns reaction exactly once');
 const ordinary=contactFixture(),vx=ordinary.p.vx*.999,vy=(ordinary.p.vy+980*h)*.999;
 Object.assign(ordinary.p,{x:swept.p.x-ordinary.n.x*1e-6-vx*h,y:swept.p.y-ordinary.n.y*1e-6-vy*h});
 impulseCount=0;a.stepPhysics(ordinary.w,h,a.crawlerTops(ordinary.w));assert.equal(impulseCount,1);
 assert.ok(Math.hypot(swept.p.vx-ordinary.p.vx,swept.p.vy-ordinary.p.vy)<1e-6,'normal rebound and tangential response match ordinary contact');
 for(let i=0;i<swept.w.gears.length;i++)assert.ok(Math.abs(swept.w.gears[i].omega-ordinary.w.gears[i].omega)<1e-6,'belt reaction matches ordinary contact');
 assert.ok(kinetic(swept)<before,'passive ball plus network cannot gain kinetic energy');
 console.log('PASS swept vs ordinary contact: identical rebound, one friction reaction, equal belt load and no passive kinetic energy gain',{
  rebound:swept.p.vx*swept.n.x+swept.p.vy*swept.n.y,beltSpeed:swept.w.belts[0].speed,energyBefore:before,energyAfter:kinetic(swept)});
}
