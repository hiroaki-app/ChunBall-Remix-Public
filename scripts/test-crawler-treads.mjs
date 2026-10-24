import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:['world','sim','beltGearContact'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={module:{exports:{}}};vm.runInNewContext(bundle.outputFiles[0].text,c);const a=c.module.exports;
const source=fs.readFileSync('src/draw.ts','utf8');
const drawing=source.slice(source.indexOf('function drawBeltLadder('),source.indexOf('function drawBeltDraft('));
let marks=[];
const renderer=vm.createContext({strokeLine:(_ctx,x1,y1,x2,y2)=>marks.push({x:(x1+x2)/2,y:(y1+y2)/2})});
vm.runInContext(ts.transpileModule(drawing,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,renderer);
const ctx=new Proxy({},{get:()=>()=>{}});
function phase(w){marks=[];renderer.drawPlacedBelts(ctx,w);return marks[0];}
for(const angle of [0,-.4,.4,Math.PI,Math.PI-.4])for(const side of [-1,1])for(const sign of [-1,1]){
 const w=a.createStage('free');Object.assign(w,{gears:[],segments:[],belts:[],freeBelts:[],particles:[],blowers:[],spawnAcc:-1e6});
 const u={x:Math.cos(angle),y:Math.sin(angle)},n={x:-u.y,y:u.x};
 a.addPlacedBelt(w,600,360,600+u.x*250,360+u.y*250);
 a.addPlacedGear(w,600+u.x*125+n.x*42.9*side,360+u.y*125+n.y*42.9*side,28,a.placedGearDrive(28,sign,3),{motorKind:'motor'});
 for(let i=0;i<120;i++)a.updateWorld(w,1/60);
 const belt=w.belts[0];assert.ok(Math.abs(belt.speed)>1);
 const upper=w.segments.filter(s=>s.belt===belt.id&&Math.hypot(s.bx-s.ax,s.by-s.ay)>200).sort((s,t)=>(s.ay+s.by)-(t.ay+t.by))[0];
 // Compare small phase displacement against the actual upper conveyor vector.
 const snapshot=JSON.stringify(w);belt.travel=3;const p=phase(w);belt.travel+=.01;const q=phase(w);
 const vx=(upper.bx-upper.ax)/250*upper.conveyor,vy=(upper.by-upper.ay)/250*upper.conveyor;
 assert.ok(((q.x-p.x)*vx+(q.y-p.y)*vy)*belt.speed>0,'tread displacement agrees with upper surface velocity');
 const before=JSON.stringify(w);phase(w);assert.equal(JSON.stringify(w),before,'renderer must not modify physics');
 assert.ok(snapshot.length>0);
}
console.log('PASS upper carrying-run treads: horizontal/incline/decline, both endpoint orders, both contact sides and motor directions; rendering is read-only');
