// Diagnostic tracing adds overhead: keep this run separate from acceptance suites.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { resolveOutputOutside } from './desktop-ram-fixtures.mjs';

const {values}=parseArgs({options:{output:{type:'string'},source:{type:'string'},driver:{type:'string'}}});
if(!values.output||!values.source)throw new Error('Use --source SNAPSHOT --output NEW_DIRECTORY [--driver FROZEN_DRIVER]');
const output=await resolveOutputOutside(values.source,values.output);await mkdir(output);
let driver=await readFile(values.driver??fileURLToPath(new URL('./desktop-ram-app.mjs',import.meta.url)),'utf8');
const replace=(needle,replacement)=>{
  if(driver.split(needle).length!==2)throw new Error('Unexpected workload driver; cannot safely insert GPU diagnostic');
  driver=driver.replace(needle,replacement);
};
driver="import { contentTracing } from 'electron';\n"+driver;
replace("    await stage('graph-pan-zoom-resize', graph);",`    await contentTracing.startRecording({recording_mode:'record-until-full',trace_buffer_size_in_kb:65536,
      included_categories:['disabled-by-default-memory-infra','cc','viz'],
      memory_dump_config:{triggers:[{mode:'detailed',periodic_interval_ms:1000}]}});
    await stage('graph-pan-zoom-resize', graph);
    await stage('gpu-resize-sweep',async()=>{
      for(let cycle=0;cycle<2;cycle++) for(const size of [[800,600],[1280,820],[1600,1000],[2560,1600],[3840,2160]]) {
        window.setContentSize(...size);await pause(2000);
        await emit('gpu-surface',{cycle,requested:size,telemetry:await telemetry()});
      }
    });`);
replace("    await writeFile(config.result,JSON.stringify({ok:true,errors},null,2));",`    const trace=await contentTracing.stopRecording(config.result.replace('result.json','gpu-trace.json'));
    await emit('gpu-trace',{file:trace});
    await writeFile(config.result,JSON.stringify({ok:true,errors},null,2));`);
const file=path.join(output,'gpu-driver.mjs');await writeFile(file,driver);
const code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[fileURLToPath(new URL('./desktop-ram-benchmark.mjs',import.meta.url)),
    '--source',path.resolve(values.source),'--driver',file,'--output',path.join(output,'suite'),
    '--counts','1000','--repetitions','1','--settle','15','--recovery','300','--no-semantic'],{stdio:'inherit'});
  child.once('error',reject);child.once('exit',resolve);
});
if(code!==0)throw new Error('GPU diagnostic workload failed: '+code);
