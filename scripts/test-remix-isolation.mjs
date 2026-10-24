import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {build} from 'esbuild';
const reads=[],writes=[],store=new Map([['chunball.save.slot.0','original sentinel']]);
const storage={getItem:k=>{reads.push(k);return store.get(k)??null;},setItem:(k,v)=>{writes.push(k);store.set(k,v);},removeItem:k=>{writes.push(k);store.delete(k);}};
const b=await build({stdin:{contents:"export * from './src/world';export * from './src/save';",resolveDir:process.cwd()},bundle:true,write:false,platform:'node',format:'cjs'});
const c={Math,URLSearchParams,module:{exports:{}},localStorage:storage,window:{localStorage:storage,location:{search:''}}};
vm.runInNewContext(b.outputFiles[0].text,c);const a=c.module.exports;
for(const stage of ['sewer','free','sandbox','wash'])for(const version of [1,2,3]){
 const data=JSON.parse(JSON.stringify(a.captureSaveGame(a.createStage(stage))));data.version=version;
 const parsed=a.parseSaveGame(data);assert.ok(parsed);assert.equal(a.loadSaveGame(parsed).stage,stage);
}
const data=JSON.parse(JSON.stringify(a.captureSaveGame(a.createStage('free'))));data.stageId='combine';assert.equal(a.parseSaveGame(data),null);
a.listSlots();assert.ok(a.writeSlot(0,a.captureSaveGame(a.createStage('free'))));
assert.ok(reads.every(k=>k.startsWith('chunball.remix.save.slot.')));
assert.ok(writes.every(k=>k.startsWith('chunball.remix.save.slot.')));
assert.equal(store.get('chunball.save.slot.0'),'original sentinel');
for(const file of fs.readdirSync('src'))if(file.endsWith('.ts'))assert.doesNotMatch(fs.readFileSync('src/'+file,'utf8'),/combine|コンバイン|auger|winnow|thresh/i,file);
assert.ok(!fs.existsSync('combine'));assert.ok(!fs.existsSync('.env'));
assert.doesNotMatch(fs.readFileSync('dist/sw.js','utf8'),/\/combine/);
console.log('PASS Remix isolation: four-stage v1/v2/v3, excluded stage rejected, separate saves, no excluded source/entry/cache');
