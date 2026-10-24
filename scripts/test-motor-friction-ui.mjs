import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {build} from 'esbuild';
const b=await build({stdin:{contents:['world','draw','save','spin','model','gate','recvTruck','freeBelt','sim','beltGearContact'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
for(const pointerType of ['mouse','touch']) {
 const labels=[],ctx=new Proxy({fillText:t=>labels.push(t),measureText:()=>({width:20})},{get:(o,k)=>o[k]??(()=>{})});
 const events={},canvas={style:{},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},addEventListener:(n,f)=>events[n]=f};
 const c=vm.createContext({console,performance,URLSearchParams,document:{body:{dataset:{}},getElementById:()=>canvas},window:{innerWidth:1280,innerHeight:720,devicePixelRatio:1,location:{search:''},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},module:{exports:{}}});
 vm.runInContext(b.outputFiles[0].text,c);const a=c.module.exports;Object.assign(c,a,{createSaveUi:()=>({})});
 vm.runInContext(ts.transpileModule(fs.readFileSync('src/main.ts','utf8').replace(/^import[\s\S]*?;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,c);
 const p=(x,y)=>({pointerId:1,clientX:x,clientY:y,pointerType,preventDefault(){}});
 const click=(x,y)=>{events.pointerdown(p(x,y));events.pointerup(p(x,y));};
 const drag=(x,y,u,v)=>{events.pointerdown(p(x,y));events.pointermove(p(u,v));events.pointerup(p(u,v));};
 const stage=a.STAGE_BTNS.find(b=>b.id==='free');click(stage.x+20,stage.y+20);
 const w=vm.runInContext('world',c);w.particles=[];w.segments=[];w.spawnAcc=-1e6;
 click(a.BELT_LAUNCH.x,a.BELT_LAUNCH.y);drag(300,350,900,350);
 const launch=a.GEAR_LAUNCH.find(g=>g.r===28);drag(launch.x,launch.y,650,387.1);
 const g=w.gears.find(g=>g.motorKind==='motor');assert.ok(g&&g.frictionContact&&g.motorFrictionContact);
 assert.equal(g.y,307.1);assert.equal(a.prepareBeltGearContacts(w).length,1);
 for(let i=0;i<120;i++)a.updateWorld(w,1/60);assert.ok(Math.abs(w.belts[0].speed)>1);
 drag(g.x,g.y,650,387.1);const moved=w.gears.find(g=>g.motorKind==='motor');assert.equal(moved.motorFrictionContact,true);
 a.addPlacedGear(w,800,307.1,28,a.placedGearDrive(28),{motorKind:'motor',frictionContact:true,motorFrictionContact:false});
 drag(800,307.1,800,387.1);const old=w.gears.find(g=>g.x===800&&g.motorKind==='motor');assert.equal(old.motorFrictionContact,false,'moving old edited motor must not upgrade it');
 console.log('PASS normal UI new motor drive and new/old reposition opt-in',pointerType);
 // Real free-belt outline: broad UI approach range resolves to exact contact.
 for(const kind of ['motor','follower'])for(const r of [18,28,40])for(const offset of [-12.001,-12,-10,-8,-4,-3.001,-3,-2.25,-.5001,-.5,-.25,0,.5,.5001,8,12,12.001,30]) {
  vm.runInContext('world=createStage("free")',c);const w=vm.runInContext('world',c);
  w.gears=[];w.belts=[];w.segments=[];w.particles=[];w.blowers=[];w.spawnAcc=-1e6;
  a.addFreeBelt(w,[{x:300,y:350},{x:1000,y:350},{x:1000,y:600},{x:300,y:600}]);
  for(const x of [400,850])a.addPlacedGear(w,x,383,28,0,{motorKind:'follower'});
  const y=350-(r+5+offset),launch=(kind==='motor'?a.GEAR_LAUNCH:a.FOLLOWER_LAUNCH).find(g=>g.r===r);
  events.pointerdown(p(launch.x,launch.y));events.pointermove(p(650,y+r+52));
  const snapped=offset>=-12&&offset<=12,allowed=snapped||offset>=-.5;
  const preview=vm.runInContext('({x:dragGear.x,y:dragGear.y})',c),expectedY=snapped?350-(r+5):y;
  assert.ok(Math.abs(preview.y-expectedY)<1e-9,'preview must show resolved snap coordinate');
  labels.length=0;vm.runInContext('paint()',c);
  assert.equal(labels.includes('ベルトと重なっています'),!allowed,'preview must agree with placement');
  if(snapped)assert.ok(labels.includes('外側摩擦接触位置'),'visible friction contact cue');
  events.pointerup(p(650,y+r+52));
  const g=w.gears.find(g=>g.x===650);assert.equal(!!g,allowed,'placement boundary');
  assert.equal(a.prepareBeltGearContacts(w).length,snapped?1:0,'snapped physical contact boundary');
  if(g){assert.ok(Math.abs(g.y-preview.y)<1e-9&&g.x===preview.x,'preview and committed coordinate identical');}
  if(kind==='motor'&&r===28&&offset===8){
   for(let i=0;i<120;i++)a.updateWorld(w,1/60);
   assert.ok(Math.abs(w.freeBelts[0].speed)>1,'normal UI free-belt motor actually drives');
   console.log('MEASURE UI free belt',pointerType,{y,beltSpeed:w.freeBelts[0].speed});
   click(g.x,g.y);for(let i=0;i<360;i++)a.updateWorld(w,1/60);assert.ok(w.freeBelts[0].speed>1,'normal UI motor tap reverses belt');
  }
 }
 console.log('PASS free-belt preview/placement/physics boundary, motor/follower, r18/28/40',pointerType);
 // No geometry/gear fixtures: draw the loop and place every gear through main's
 // actual pointer handlers. Measure the missing-support and supported cases.
 vm.runInContext('world=createStage("free")',c);const uiWorld=vm.runInContext('world',c);
 click(a.FREE_BELT_LAUNCH.x,a.FREE_BELT_LAUNCH.y);
 const outline=[{x:300,y:350},{x:1000,y:350},{x:1000,y:600},{x:300,y:600},{x:300,y:350}];
 events.pointerdown(p(300,350));for(const q of outline.slice(1))events.pointermove(p(q.x,q.y));events.pointerup(p(300,350));
 assert.equal(uiWorld.freeBelts.length,1,'loop drawn through normal input');
 const motor=a.GEAR_LAUNCH.find(g=>g.r===28),follower=a.FOLLOWER_LAUNCH.find(g=>g.r===28);
 drag(motor.x,motor.y,650,389);const source=uiWorld.gears.find(g=>g.motorKind==='motor');
 assert.equal(source.y,317);assert.equal(source.motorFrictionContact,true);
 for(const supports of [0,1,2]) {
  if(supports)drag(follower.x,follower.y,supports===1?400:850,463);
  for(let i=0;i<120;i++)a.updateWorld(uiWorld,1/60);
  const contact=a.prepareBeltGearContacts(uiWorld).find(q=>q.gear===source);
  assert.ok(contact,'normal UI placement is a physical friction candidate');
  const body=a.beltContactBody(uiWorld,contact.key);
  assert.equal(!!body,supports===2,'support requirement creates the belt contact body');
  if(body)assert.notEqual(a.gearContactToken(uiWorld,source),body.network,'not a duplicate rigid connection');
  assert.equal(Math.abs(uiWorld.freeBelts[0].speed)>1,supports===2);
  events.pointerdown(p(motor.x,motor.y));events.pointermove(p(550,389));
  labels.length=0;vm.runInContext('paint()',c);
  assert.ok(labels.includes(supports===2?'外側摩擦接触位置':'外側摩擦接触位置（内側ローラー2個必要）'));
  assert.ok(!labels.includes('ベルトと重なっています'),'valid friction cue never also reports overlap');
  events.pointercancel(p(550,389));
  console.log('MEASURE normal-input support boundary',pointerType,{supports,beltSpeed:uiWorld.freeBelts[0].speed});
 }
 click(a.FREE_BELT_LAUNCH.x,a.FREE_BELT_LAUNCH.y); // Exit loop drawing before toggling an existing gear.
 click(source.x,source.y);for(let i=0;i<360;i++)a.updateWorld(uiWorld,1/60);
 assert.ok(uiWorld.freeBelts[0].speed>1,'normal-input reversal');
 // Regression: approach an inner follower through a slightly overlapping raw
 // pose, and approach a hand-drawn segment near its next endpoint.
 for(const segmented of [false,true]) {
  vm.runInContext('world=createStage("free")',c);const w=vm.runInContext('world',c);
  w.gears=[];w.belts=[];w.segments=[];w.particles=[];w.spawnAcc=-1e6;
  a.addFreeBelt(w,segmented?[{x:300,y:350},{x:650,y:350},{x:1000,y:360},{x:1000,y:600},{x:300,y:600}]:[{x:300,y:350},{x:1000,y:350},{x:1000,y:600},{x:300,y:600}]);
  a.addPlacedGear(w,630,383,28,0,{motorKind:'follower'});
  a.addPlacedGear(w,850,567,28,0,{motorKind:'follower'});
  events.pointerdown(p(motor.x,motor.y));events.pointermove(p(630,405));
  const preview=vm.runInContext('({x:dragGear.x,y:dragGear.y})',c);
  assert.equal(preview.x,630);assert.equal(preview.y,317);
  labels.length=0;vm.runInContext('paint()',c);
  assert.ok(labels.includes('外側摩擦接触位置'));assert.ok(!labels.includes('ベルトと重なっています'));
  events.pointerup(p(630,405));const g=w.gears.find(g=>g.motorKind==='motor');
  assert.equal(g.x,preview.x);assert.equal(g.y,preview.y);
  for(let i=0;i<120;i++)a.updateWorld(w,1/60);
  const contact=a.prepareBeltGearContacts(w).find(q=>q.gear===g);assert.ok(contact);
  const body=a.beltContactBody(w,contact.key);assert.ok(body);
  assert.notEqual(a.gearContactToken(w,g),body.network);
  assert.ok(Math.abs(w.freeBelts[0].speed)>1);
 }
 console.log('PASS corrected free-belt pose before overlap/mesh rejection',pointerType);
}
