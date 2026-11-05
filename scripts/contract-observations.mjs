// Opt-in records from disposable fixtures, never production/personal memory.
export const observationPrefix = 'JUMPYBRAIN_CONTRACT ';
export function observeContract(id, value) {
  if (process.env.JUMPYBRAIN_CONTRACT_OBSERVATIONS === '1') console.log(observationPrefix + JSON.stringify({id,value}));
}
