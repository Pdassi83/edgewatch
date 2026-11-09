import type {State} from './core';

export type ScoutTriage='invalid_evidence'|'investigate_compatibility'|'insufficient_evidence'|'coverage_review'|'research_candidate';
export type ScoutReason='invalid_counters'|'invalid_queue'|'future_aggregate'|'too_few_observations'|'no_supported_swaps'|'too_few_supported_swaps'|'known_coverage_gap'|'pending_backlog'|'meets_compatibility_screen';

export const SCOUT_POLICY=Object.freeze({
 minimumObserved:30,
 minimumSupportedSwaps:5,
 maximumPendingForResearch:10,
});

export const SCOUT_LABELS:Record<ScoutTriage,string>={
 invalid_evidence:'Dados inválidos: verificar origem',
 investigate_compatibility:'Auditar compatibilidade do parser',
 insufficient_evidence:'Amostra insuficiente',
 coverage_review:'Rever cobertura e atrasos',
 research_candidate:'Candidato a investigação offline',
};

type WalletTriage={
 address:string;
 status:ScoutTriage;
 reasons:ScoutReason[];
 observed:number|null;
 supportedSwaps:number|null;
 parserCompatibilityRate:number|null;
 pending:number|null;
 knownGap:boolean;
 profitabilityEvidence:null;
};

const nonnegativeInteger=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;

/** Support either the GitHub wallet queue or the count-only status projection. */
function pendingCount(value:unknown):number|null{
 if(value==null)return 0;
 if(typeof value!=='object'||Array.isArray(value))return null;
 const p=value as {signatures?:unknown;count?:unknown};
 const hasSignatures=p.signatures!==undefined,hasCount=p.count!==undefined;
 if(hasSignatures&&(!Array.isArray(p.signatures)||!p.signatures.every(s=>typeof s==='string')))return null;
 if(hasCount&&!nonnegativeInteger(p.count))return null;
 if(hasSignatures&&hasCount&&p.signatures!.length!==p.count)return null;
 if(hasSignatures)return p.signatures!.length;
 return hasCount?p.count!:null;
}

/**
 * Read-only triage of the CURRENT aggregate. Never use it to reconstruct historical
 * decisions, replace a wallet, estimate trader profitability or submit transactions.
 * Thresholds assess parser compatibility, not the quality of an investment strategy.
 */
export function scoutWallets(state:Pick<State,'wallets'|'lastRun'|'lastSuccess'>,asOf=Date.now()){
 if(!Number.isFinite(asOf)||asOf<=0)throw Error('Instante de diagnóstico inválido');
 const futureAggregate=[state.lastRun,state.lastSuccess].some(t=>t!==null&&(!Number.isFinite(t)||t>asOf));
 const wallets:WalletTriage[]=state.wallets.map(w=>{
  const observed=nonnegativeInteger(w.observed)?w.observed:null;
  const supportedSwaps=nonnegativeInteger(w.swaps)?w.swaps:null;
  const pending=pendingCount(w.pending);
  const reasons:ScoutReason[]=[];
  if(observed===null||supportedSwaps===null||supportedSwaps>observed)reasons.push('invalid_counters');
  if(pending===null)reasons.push('invalid_queue');
  if(futureAggregate||!Number.isFinite(w.added)||w.added>asOf||
    (w.validatedAt!==undefined&&(!Number.isFinite(w.validatedAt)||w.validatedAt>asOf)))reasons.push('future_aggregate');
  if(observed!==null&&observed<SCOUT_POLICY.minimumObserved)reasons.push('too_few_observations');
  if(supportedSwaps===0)reasons.push('no_supported_swaps');
  else if(supportedSwaps!==null&&supportedSwaps<SCOUT_POLICY.minimumSupportedSwaps)reasons.push('too_few_supported_swaps');
  if(w.gap)reasons.push('known_coverage_gap');
  if(pending!==null&&pending>SCOUT_POLICY.maximumPendingForResearch)reasons.push('pending_backlog');

  let status:ScoutTriage;
  if(reasons.some(r=>['invalid_counters','invalid_queue','future_aggregate'].includes(r)))status='invalid_evidence';
  else if(observed!>=SCOUT_POLICY.minimumObserved&&supportedSwaps===0)status='investigate_compatibility';
  else if(observed!<SCOUT_POLICY.minimumObserved||supportedSwaps!<SCOUT_POLICY.minimumSupportedSwaps)status='insufficient_evidence';
  else if(w.gap||pending!>SCOUT_POLICY.maximumPendingForResearch)status='coverage_review';
  else{status='research_candidate';reasons.push('meets_compatibility_screen');}

  return {address:w.address,status,reasons,observed,supportedSwaps,
   parserCompatibilityRate:observed!==null&&observed>0&&supportedSwaps!==null&&supportedSwaps<=observed?supportedSwaps/observed:null,
   pending,knownGap:w.gap===true,profitabilityEvidence:null};
 });
 const counts:Record<ScoutTriage,number>={
  invalid_evidence:0,investigate_compatibility:0,insufficient_evidence:0,coverage_review:0,research_candidate:0,
 };
 for(const w of wallets)counts[w.status]++;
 return {schemaVersion:1 as const,mode:'observe_only' as const,kind:'current_wallet_compatibility_triage' as const,
  asOf,policy:SCOUT_POLICY,summary:{tracked:wallets.length,byStatus:counts},
  wallets,limitations:[
   'Aggregated totals may include archived activity and cannot reconstruct historical wallet states.',
   'A supported swap only demonstrates parser compatibility, not profitability.',
   'Gaps and pending transactions prevent claims of complete coverage.',
   'No wallet rotation, live trading, ranking by P/L, extra RPC calls or strategy changes.',
  ]};
}
