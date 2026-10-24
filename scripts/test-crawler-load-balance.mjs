// Production coefficients and real sandbox release. Instrumentation exists
// only in this in-memory test bundle, never in the shipped game.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
let measure=()=>{},integration=()=>{},collision=()=>{};
const bundle=await build({stdin:{contents:['world','sim','spin','sandbox','beltGearContact'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node',plugins:[{name:'read-only-load-measurement',setup(b){b.onLoad({filter:/\/(beltContact|beltGearContact|sim)\.ts$/},({path})=>{
 let s=fs.readFileSync(path,'utf8');
 if(path.endsWith('/beltContact.ts'))s=s.replace('return vt + impulse / BALL_MASS;',`__measure('ball',{impulse:-impulse*tangentProjection});return vt + impulse / BALL_MASS;`);
 else if(path.endsWith('/beltGearContact.ts'))s=s.replace('applyBeltImpulse(world, body, -impulse);',`__measure('drive',{impulse:-impulse,limit,slip,omega:c.gear.omega});applyBeltImpulse(world,body,-impulse);`);
 else s=s.replace('p.y += p.vy * dt;',`p.y += p.vy * dt;__integration(p,dt,world);`)
  .replace('collideSegment(p, s, dt, inRecvTruckHopper(world, p, 6), hopperWalls, world, claimed);',
   'collideSegment(p, s, dt, inRecvTruckHopper(world, p, 6), hopperWalls, world, claimed);__collision(p,s);');
 return {contents:s,loader:'ts'};
 });}}]});
const context={Math,module:{exports:{}},__measure:(...args)=>measure(...args),__integration:(...args)=>integration(...args),__collision:(...args)=>collision(...args)};
vm.runInNewContext(bundle.outputFiles[0].text,context);const a=context.module.exports;
assert.equal(a.PLACED_CRAWLER_MOTOR_TRACTION,2880);assert.equal(a.PLACED_CRAWLER_MOTOR_RESPONSE,200);
const ax=330,ay=510,L=Math.hypot(700,280),u={x:700/L,y:-280/L},n={x:280/L,y:700/L};
const locate=p=>({along:(p.x-ax)*u.x+(p.y-ay)*u.y,normal:(p.x-ax)*n.x+(p.y-ay)*n.y});
const round=v=>Number.isFinite(v)?+v.toFixed(2):null;
function run(count,motors,fps){
 const dt=1/fps,w=a.createStage('sandbox'),all=[...w.particles];w.particles=Array.from({length:count},(_,i)=>all[Math.floor(i*64/count)]);
 a.addPlacedBelt(w,ax,ay,1030,230);
 for(let i=0;i<motors;i++){const t=motors===1?.5:(i+1)/(motors+1);assert.ok(a.addPlacedGear(w,ax+u.x*L*t+n.x*42.9,ay+u.y*L*t+n.y*42.9,28,a.placedGearDrive(28,-1,3),{motorKind:'motor',speedLevel:3}));}
 for(let i=0;i<2*fps;i++)a.updateWorld(w,dt);
 assert.equal(a.prepareBeltGearContacts(w).length,motors);assert.ok(w.belts[0].speed<0,'uphill drive before release');
 const originals=[...w.particles],ids=new Set(originals.map(p=>p.id)),arrived=new Set(),touched=new Set(),crossings=[];
 const sums={drive:0,load:0,N:0,saturated:0,slip:0,omega:0},frame={...sums};
 let loaded=0,belt=0,ball=0,ballN=0,reverse=0,min=Infinity;
 measure=(kind,v)=>{if(kind==='ball')frame.load+=v.impulse;else{frame.drive-=v.impulse;frame.N++;frame.saturated+=Math.abs(v.impulse)>=v.limit*.99?1:0;frame.slip+=Math.abs(v.slip);frame.omega+=Math.abs(v.omega);assert.ok(Math.abs(v.impulse)<=v.limit+1e-8);}};
 integration=(p,h)=>{if(!ids.has(p.id))return;const next=locate(p),old=locate({x:p.x-p.vx*h,y:p.y-p.vy*h});
  if(next.along>10&&next.along<L-10&&old.normal< -14-p.r&&next.normal> -14)
   crossings.push({id:p.id,h,oldNormal:round(old.normal),nextNormal:round(next.normal),speed:round(Math.hypot(p.vx,p.vy)),position:[round(p.x),round(p.y)]});
 };
 collision=(p,s)=>{
  if(Math.hypot(s.bx-s.ax,s.by-s.ay)<200||Math.abs(locate({x:s.ax,y:s.ay}).normal+14)>1e-5)return;
  const crossing=crossings.at(-1);if(!crossing||crossing.id!==p.id||crossing.checked)return;
  crossing.checked=true;crossing.afterNormal=round(locate(p).normal);
  crossing.resolved=locate(p).normal<=-14-p.r+1e-5;
 };
 a.releaseSandboxBasket(w);
 for(let i=0;i<30*fps;i++){
  for(const k of Object.keys(frame))frame[k]=0;a.updateWorld(w,dt);
  const speed=-w.belts[0].speed;assert.ok(Number.isFinite(speed));min=Math.min(min,speed);if(speed< -1)reverse+=dt;
  let near=0;
  for(const p of originals){const q=locate(p);if(q.along>L-10&&q.normal<0&&Math.abs(q.normal)<50)arrived.add(p.id);
   if(q.along>=0&&q.along<=L&&Math.abs(q.normal+18.2)<6){near++;touched.add(p.id);ball+=p.vx*u.x+p.vy*u.y;ballN++;}}
  if(near||Math.abs(frame.load)>1e-9){loaded++;belt+=speed;for(const k of Object.keys(frame))sums[k]+=frame[k];}
 }
 measure=()=>{};integration=()=>{};collision=()=>{};
 const live=new Set(w.particles),pending=originals.filter(p=>!arrived.has(p.id));
 const retained=pending.filter(p=>{const q=locate(p);return live.has(p)&&q.along>=0&&q.along<=L&&q.normal>=-80&&q.normal<=0;});
 const culled=pending.filter(p=>!live.has(p));for(const p of culled)assert.ok(p.x< -40||p.x>1320||p.y< -40||p.y>780,'no interior deletion');
 const elsewhere=pending.filter(p=>live.has(p)&&!retained.includes(p));
 assert.equal(arrived.size+retained.length+culled.length+elsewhere.length,count);
 if(count<=5)assert.ok(arrived.size>=count-1,'at least 4/5 small-load balls must arrive at each frame rate');
 const missedCrossings=crossings.filter(q=>!q.resolved).length;
 assert.equal(missedCrossings,0,'every detected fast upper crossing must be resolved');
 const row={fps,count,motors,arrived:arrived.size,retained:retained.length,stalled:retained.filter(p=>Math.abs(p.vx*u.x+p.vy*u.y)<5).length,culled:culled.length,elsewhere:elsewhere.map(p=>({id:p.id,x:round(p.x),y:round(p.y),touched:touched.has(p.id)})),neverTouched:count-touched.size,beltSpeed:round(belt/loaded),ballVelocity:round(ball/ballN),reverse:round(reverse),minimumSpeed:round(min),motorOmega:round(sums.omega/sums.N),slip:round(sums.slip/sums.N),saturation:round(sums.saturated/sums.N*100),driveForce:round(sums.drive/(loaded*dt)),loadForce:round(sums.load/(loaded*dt)),missedCrossings,crossings};
 console.log(JSON.stringify(row));return row;
}
const rows=[];for(const fps of [30,60,120])for(const count of [1,5,16,64])for(const motors of [1,2,3])rows.push(run(count,motors,fps));
const at=(count,motors)=>rows.find(r=>r.fps===60&&r.count===count&&r.motors===motors);
assert.equal(at(5,1).arrived,5);assert.ok(at(16,3).arrived+at(16,3).retained>at(16,1).arrived+at(16,1).retained);
assert.ok(at(64,1).reverse>0,'overload backdrive remains possible');
fs.writeFileSync('/tmp/chunball-remix-crawler-load-production.json',JSON.stringify(rows,null,2));
console.log('PASS swept crawler load matrix: zero unresolved fast crossings and finite contact bounds; dense frame-rate differences are reported');
