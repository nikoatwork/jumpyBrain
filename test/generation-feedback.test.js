import assert from 'node:assert/strict';import test from 'node:test';
import {createGenerationFeedback} from '../dist/adapters/http-server/generation-feedback.js';
const snapshot=(state,extra={})=>({epoch:'epoch',saved:true,stream:{actor:'actor-a',streamId:'stream',sequence:1,state,...extra}});
test('generation feedback requires observed active and a confirmed terminal state, never presence loss',()=>{
  const feedback=createGenerationFeedback();
  assert.equal(feedback.observe(snapshot('finished')),null,'historical terminal receipt');
  assert.equal(feedback.observe({...snapshot('active'),stream:undefined}),null,'no stream evidence');
  assert.equal(feedback.observe(snapshot('active',{actor:undefined})),null,'old server cannot identify stream owner');
  assert.deepEqual(feedback.observe(snapshot('active')),{kind:'active',text:''});
  assert.equal(feedback.observe({epoch:'epoch',saved:true}),null,'presence disappearance is not completion');
  assert.equal(feedback.observe({...snapshot('finished'),saved:false}),null,'unconfirmed snapshot');
  assert.deepEqual(feedback.observe(snapshot('finished')),{kind:'finished',text:'Generation finished'});
  assert.equal(feedback.observe(snapshot('finished')),null,'duplicate terminal receipt');
  assert.equal(feedback.observe(snapshot('active')),null,'retired stream cannot restart from a replay');
});
test('stream identities include actor; explicit stop and interrupted output never become finished',()=>{
  const feedback=createGenerationFeedback();feedback.observe(snapshot('active'));feedback.observe(snapshot('active',{actor:'actor-b'}));
  assert.deepEqual(feedback.observe(snapshot('cancelled',{reason:'cancelled'})),{kind:'stopped',text:'Generation stopped'});
  assert.deepEqual(feedback.observe(snapshot('cancelled',{actor:'actor-b',reason:'lease_expired'})),{kind:'interrupted',text:'Generation interrupted'});
  assert.equal(feedback.observe(snapshot('finished',{actor:'actor-b'})),null,'cancelled stream cannot later claim finish');
  feedback.observe(snapshot('active',{streamId:'revoked'}));
  assert.equal(feedback.observe(snapshot('cancelled',{streamId:'revoked',reason:'authorization_revoked'})).kind,'interrupted');
});
test('scope reset and epoch changes forget unobserved completions and reject malformed evidence',()=>{
  const feedback=createGenerationFeedback();feedback.observe(snapshot('active'));feedback.reset();assert.equal(feedback.observe(snapshot('finished')),null);
  feedback.observe(snapshot('active'));assert.equal(feedback.observe({...snapshot('finished'),epoch:'new-epoch'}),null);
  for(const invalid of [{sequence:-1},{sequence:NaN},{actor:''},{actor:'x'.repeat(1025)},{streamId:''},{state:'not-a-state'}])assert.equal(feedback.observe({...snapshot('active',invalid),epoch:'new-epoch'}),null);
  feedback.observe({...snapshot('active'),epoch:'new-epoch'});assert.equal(feedback.observe({...snapshot('finished'),epoch:'new-epoch'}).kind,'finished');
});
test('generation observation is bounded and conservatively drops evicted active streams',()=>{
  const feedback=createGenerationFeedback();for(let i=0;i<100;i++)feedback.observe(snapshot('active',{streamId:'stream-'+i}));
  assert.equal(feedback.observe(snapshot('finished',{streamId:'stream-0'})),null);
  assert.equal(feedback.observe(snapshot('finished',{streamId:'stream-99'})).kind,'finished');
});
test('an older terminal sequence cannot end newly observed output',()=>{
  const feedback=createGenerationFeedback();feedback.observe(snapshot('active',{sequence:4}));
  assert.equal(feedback.observe(snapshot('active',{sequence:2})),null);
  assert.equal(feedback.observe(snapshot('finished',{sequence:3})),null);
  assert.equal(feedback.observe(snapshot('finished',{sequence:4})).kind,'finished');
});
