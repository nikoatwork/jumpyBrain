import assert from 'node:assert/strict';
import test from 'node:test';
import {assessCheck} from '../scripts/multiplayer-verify.mjs';
const check={markers:['SCENARIO_PASS'],observationIds:['state']};
const baselineValue={body:'canonical bytes',draft:'unique private draft',status:'unconfirmed',scopeChanged:true};
const execution=value=>({code:0,output:'SCENARIO_PASS\nJUMPYBRAIN_CONTRACT '+JSON.stringify({id:'state',value})+'\n'});
const baseline=assessCheck(check,execution(baselineValue));
test('unchanged checkpoint passes while content, draft, Saved and scope regressions fail',()=>{
  assert.equal(baseline.status,'passed');assert.equal(assessCheck(check,execution(baselineValue),baseline).status,'passed');
  for(const change of [{body:'regressed'},{draft:''},{status:'saved'},{scopeChanged:false}]) {
    const result=assessCheck(check,execution({...baselineValue,...change}),baseline);
    assert.equal(result.status,'failed');assert.match(result.reason,/observations differ/);
  }
});
test('missing, duplicate, malformed and renamed checkpoints cannot pass',()=>{
  for(const output of ['SCENARIO_PASS','SCENARIO_PASS\nJUMPYBRAIN_CONTRACT {','SCENARIO_PASS\nJUMPYBRAIN_CONTRACT {"id":"state"}',execution(baselineValue).output.repeat(2),execution(baselineValue).output.replace('"state"','"other"')])assert.equal(assessCheck(check,{code:0,output},baseline).status,'failed');
});
