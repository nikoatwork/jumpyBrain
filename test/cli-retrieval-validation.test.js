import assert from 'node:assert/strict';import test from 'node:test';
import {runMemoryCommand} from '../dist/cli/memory-commands.js';

test('invalid retrieval depth is explained before local engine or remote credentials are touched',async()=>{
  const noTransport=new Proxy({}, {get(_target,key){assert.fail('invalid input must not access local transport: '+String(key));}});
  for(const command of ['search','recall'])for(const compact of [false,true])for(const target of [{root:'/unused-root'},{'target-url':'https://brain.example'}]){
    await assert.rejects(runMemoryCommand(command,{...target,query:'anything',depth:'sideways',...(compact?{compact:true}:{})},noTransport),/Invalid --depth 'sideways'\. Use one of: shallow, normal, deep/);
  }
});
