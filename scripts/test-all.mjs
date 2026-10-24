import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
let count=0;
for(const file of fs.readdirSync('scripts').filter(x=>/^test-.*\.mjs$/.test(x)&&x!=='test-all.mjs')){
 if(file==='test-remix-parity.mjs'&&!process.env.BASELINE_ROOT){console.log('SKIP original comparison: set BASELINE_ROOT to a read-only original checkout');continue;}
 console.log('RUN',file);
 const args=['scripts/'+file];if(file==='test-remix-parity.mjs')args.push(process.env.BASELINE_ROOT);
 const result=spawnSync(process.execPath,args,{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);count++;
}
console.log('PASS all test scripts:',count);
