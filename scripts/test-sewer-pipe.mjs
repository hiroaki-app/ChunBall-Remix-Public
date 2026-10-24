import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:['world','sim','sewer'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,c);const a=c.module.exports;
const pts=a.SED_SWIRL_PIPE.points;
const distance=(p,u,v)=>{const dx=v.x-u.x,dy=v.y-u.y,t=Math.max(0,Math.min(1,((p.x-u.x)*dx+(p.y-u.y)*dy)/(dx*dx+dy*dy)));return Math.hypot(p.x-u.x-t*dx,p.y-u.y-t*dy);};
for(const dt of [1/60,1/120])for(const vx of [40,110,250]){
 const w=a.createStage('sewer');w.particles=[];w.spawnAcc=-1e6;
 const p={id:w.nextId++,kind:'grain',x:725,y:276,vx,vy:0,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0};w.particles=[p];
 let vertical=false,lower=false,exited=false,maxDistance=0;
 for(let i=0;i<Math.round(8/dt);i++){
  a.updateWorld(w,dt);
  if(p.stem>0){assert.ok(lower,'swirl cannot capture before the bottom elbow');exited=true;break;}
  const d=Math.min(...pts.slice(1).map((v,j)=>distance(p,pts[j],v)));maxDistance=Math.max(maxDistance,d);
  assert.ok(d<=a.SED_SWIRL_PIPE.halfWidth+.5,`outside pipe: ${p.x},${p.y}, distance ${d}`);
  if(p.y>330&&p.y<380)vertical=true;
  if(p.x>775&&p.y>390)lower=true;
 }
 assert.ok(vertical&&lower&&exited,`full route required: ${vertical}/${lower}/${exited} at ${p.x},${p.y}`);
 assert.ok(w.particles.includes(p));console.log('PASS pipe route',dt,'vx',vx,'maximum center distance',maxDistance);
}
