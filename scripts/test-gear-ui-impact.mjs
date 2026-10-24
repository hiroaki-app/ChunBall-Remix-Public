// Normal pointer placement + actual RAF/paint path, including a public baseline.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { build } from 'esbuild';
const root = process.argv[2] ?? process.cwd();
const bundle = await build({stdin:{contents:['world','draw','save','spin','model','gate','recvTruck','freeBelt','sim','beltGearContact'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:root},bundle:true,write:false,format:'cjs',platform:'node'});
function harness(stage, pair, type='mouse', natural=false) {
  const events={}, rotations=[];
  const ctx=new Proxy({rotate:a=>rotations.push(a),measureText:s=>({width:s.length*8})},{get:(o,k)=>o[k]??(()=>{})});
  const canvas={style:{},getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0}),setPointerCapture(){},addEventListener:(n,f)=>events[n]=f};
  let seed=1234;const math=Object.create(Math);math.random=()=>((seed=(1664525*seed+1013904223)>>>0)/2**32);
  const c=vm.createContext({console,Math:math,performance,URLSearchParams,document:{body:{dataset:{}},getElementById:()=>canvas},window:{innerWidth:1280,innerHeight:720,devicePixelRatio:1,location:{search:''},addEventListener(){}},localStorage:{getItem:()=>null,setItem(){}},requestAnimationFrame(){},module:{exports:{}}});
  vm.runInContext(bundle.outputFiles[0].text,c);const a=c.module.exports;
  Object.assign(c,a,{createSaveUi:()=>({})});
  vm.runInContext(ts.transpileModule(fs.readFileSync(`${root}/src/main.ts`,'utf8').replace(/^import[\s\S]*?;\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,c);
  const p=(x,y)=>({pointerId:1,clientX:x,clientY:y,pointerType:type,preventDefault(){}});
  const hud=a.STAGE_BTNS.find(b=>b.id===stage);events.pointerdown(p(hud.x+20,hud.y+20));events.pointerup(p(hud.x+20,hud.y+20));
  const base=natural?(stage==='free'?{x:522,y:317}:{x:680,y:300}):{x:500,y:300};
  for(const x of pair?[base.x,base.x+56]:[base.x]) {
    const launch=a.FOLLOWER_LAUNCH.find(g=>g.r===28);
    events.pointerdown(p(launch.x,launch.y));events.pointermove(p(x,base.y+80));events.pointerup(p(x,base.y+80));
  }
  const w=vm.runInContext('world',c),gears=w.gears.filter(g=>g.placed);
  assert.equal(gears.length,pair?2:1);assert.ok(gears.every(g=>g.motorKind==='follower'&&g.drive===0));
  // Isolate collision fixtures after exercising the production UI creation path.
  if(!natural){w.segments=[];w.belts=[];w.freeBelts=[];w.blowers=[];w.particles=[];w.spawnAcc=-1e6;}
  const frame=()=>{rotations.length=0;vm.runInContext('frame(last+1000/60)',c);assert.ok(rotations.some(r=>r===gears[0].angle),'paint must use current physical angle');};
  return {w,gears,frame};
}
for(const stage of ['free','sewer'])for(const pair of [false,true]) {
 const {w,gears,frame}=harness(stage,pair,'mouse',true),g=gears[0];let travel=0,peak=0,previous=g.angle;
 for(let i=0;i<600;i++){frame();travel+=Math.abs(g.angle-previous);previous=g.angle;peak=Math.max(peak,Math.abs(g.omega));}
 console.log(JSON.stringify({natural:stage,pair,travel,peak,balls:w.particles.length}));
}
for(const stage of ['free','sewer']) for(const pair of [false,true]) for(const continuous of [false,true]) {
 const {w,gears,frame}=harness(stage,pair),g=gears[0];
 const initial=g.angle;let travel=0,peak=0,previous=g.angle,reversals=0,lastSign=0,movingTime=0;
 for(let i=0;i<600;i++) {
  if(i===0||(continuous&&i<180&&i%30===0))w.particles.push({id:w.nextId++,kind:'grain',x:g.x+16,y:g.y-60,vx:0,vy:0,r:4.2,frozen:false,standing:false,stem:0,angle:0,marked:false,color:'#fff',trackId:null,headColors:[],depth:0});
  frame();const d=g.angle-previous;travel+=Math.abs(d);previous=g.angle;peak=Math.max(peak,Math.abs(g.omega));if(Math.abs(g.omega)>.1)movingTime+=1/60;
  const sign=Math.abs(g.omega)>.01?Math.sign(g.omega):0;if(sign&&lastSign&&sign!==lastSign)reversals++;if(sign)lastSign=sign;
 }
 assert.ok(travel>.05,'visible accumulated rotation');
 console.log(JSON.stringify({stage,pair,continuous,angle:g.angle-initial,travel,peak,reversals,movingTime}));
}
