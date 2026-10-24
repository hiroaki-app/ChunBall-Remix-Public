import vm from 'node:vm';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const b=await build({stdin:{contents:['world','freeBelt','beltGearContact','spin'].map(m=>`export * from './src/${m}';`).join(''),resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',platform:'node'});
const c={module:{exports:{}}};vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
function setup(crawler=false){const w=a.createStage('free');w.gears=[];w.belts=[];w.segments=[];w.freeBelts=[];if(crawler)a.addPlacedBelt(w,300,350,1000,350);else a.addFreeBelt(w,[{x:300,y:350},{x:1000,y:350},{x:1000,y:600},{x:300,y:600}]);return w;}
for(const crawler of [false,true])for(const motorKind of ['motor','follower'])for(const r of [18,28,40])for(const gap of [-12.001,-12,-10,-8,-4,-3.001,-3,-2,0,6,12,12.001,30]) {
 const w=setup(crawler),raw={x:650,y:(crawler?336:350)-(r+(crawler?.9:5)+gap),r,motorKind};
 const snap=a.outerBeltSnap(w,raw),expected=gap>=-12&&gap<=12;assert.equal(!!snap,expected);
 if(snap){assert.ok(Math.abs(snap.y-((crawler?336:350)-r-(crawler?.9:5)))<1e-8);assert.ok(a.gearPlacementAllowed(w,{...raw,...snap}));}
 else assert.equal(JSON.stringify(a.resolveGearPlacement(w,raw)),JSON.stringify({x:raw.x,y:raw.y}));
}
const motor={x:650,y:309,r:28,motorKind:'motor'};
// Rotation/translation of the surface must not change the snap distance.
for(const angle of [.35,-.6,Math.PI]) {
 const w=setup(),cos=Math.cos(angle),sin=Math.sin(angle);
 const rotate=p=>({x:650+(p.x-650)*cos-(p.y-450)*sin,y:450+(p.x-650)*sin+(p.y-450)*cos});
 for(const s of w.segments){const p=rotate({x:s.ax,y:s.ay}),q=rotate({x:s.bx,y:s.by});Object.assign(s,{ax:p.x,ay:p.y,bx:q.x,by:q.y});}
 for(const belt of w.freeBelts)belt.points=belt.points.map(rotate);
 const raw=rotate(motor),target=rotate({x:650,y:317}),snap=a.outerBeltSnap(w,{...motor,...raw});
 assert.ok(snap);assert.ok(Math.hypot(snap.x-target.x,snap.y-target.y)<1e-7);
}
for(const point of [{x:300,y:309},{x:301,y:309},{x:650,y:330},{x:650,y:350},{x:257.1,y:350}])assert.equal(a.outerBeltSnap(setup(),{...motor,...point}),null,'corners/deep overlap');
assert.equal(a.outerBeltSnap(setup(true),{...motor,x:257.1,y:350}),null,'caps and meshing roller excluded');
const two=setup();a.addFreeBelt(two,[{x:300,y:100},{x:1000,y:100},{x:1000,y:268},{x:300,y:268}]);assert.equal(a.outerBeltSnap(two,motor),null,'two nearby outside faces');
const crossing=setup();a.addFreeBelt(crossing,[{x:600,y:100},{x:900,y:100},{x:900,y:307},{x:600,y:307}]);assert.equal(a.outerBeltSnap(crossing,motor),null,'other loop penetration');
const inner=setup();assert.equal(a.outerBeltSnap(inner,{...motor,y:383}),null);assert.equal(JSON.stringify(a.resolveGearPlacement(inner,{...motor,y:380})),JSON.stringify({x:650,y:383}),'old inner snap wins');
assert.equal(a.outerBeltSnap(setup(),{...motor,motorFrictionContact:false,frictionContact:true}),null,'old motor stays opt-out');
assert.equal(a.outerBeltSnap(setup(),{...motor,motorKind:'follower',frictionContact:false}),null);
for(const y of [253,261]){const w=setup();a.addPlacedGear(w,650,y,28,0,{motorKind:'follower'});assert.equal(a.outerBeltSnap(w,motor),null,'do not break/create a direct mesh');}
{const w=setup();a.addPlacedGear(w,650,317,28,0,{motorKind:'follower'});assert.equal(a.outerBeltSnap(w,{...motor,y:325}),null,'never snap into another gear disk');}
for(const y of [350,355,360])assert.equal(a.outerBeltSnap(setup(),{...motor,y}),null,'no outer snap through the loop to its inside');
{
 const w=setup(true),raw={...motor,y:317.1};
 assert.equal(a.gearPlacementAllowed(w,raw),false,'raw crawler overlap must not be committed');
 const resolved=a.resolveGearPlacement(w,raw);assert.ok(Math.abs(resolved.y-307.1)<1e-8);
 assert.equal(a.gearPlacementAllowed(w,{...raw,...resolved}),true,'only tangent corrected disk is legal');
 assert.equal(a.outerBeltSnap(w,{...motor,y:320.1}),null,'beyond inward range');
 assert.equal(a.gearPlacementAllowed(w,{...motor,y:320.1}),false,'deep crawler overlap rejected');
 assert.equal(a.gearPlacementAllowed(w,{...motor,x:300,y:308}),true,'existing crawler roller meshing remains available');
}
console.log('PASS free-belt/crawler snap range, radii, roles, corners, caps, ambiguity, penetration, legacy and mesh priority');
// Hand-drawn segmentation and an inner roller must be checked at the corrected
// tangent pose, not at the temporary overlapping pointer pose.
for (const segmented of [false,true]) {
 const w=setup();
 if(segmented){w.freeBelts=[];w.segments=[];a.addFreeBelt(w,[{x:300,y:350},{x:650,y:350},{x:1000,y:360},{x:1000,y:600},{x:300,y:600}]);}
 else a.addPlacedGear(w,630,383,28,0,{motorKind:'follower'});
 const raw={...motor,x:630,y:325},snap=a.outerBeltSnap(w,raw);
 assert.ok(snap,'legal free-belt correction survives raw endpoint/inner-roller proximity');
 assert.equal(snap.x,630);assert.equal(snap.y,317);
 assert.ok(a.gearPlacementAllowed(w,{...raw,...snap}));
}
console.log('PASS free-belt raw overlap near adjacent endpoint and inner follower');
