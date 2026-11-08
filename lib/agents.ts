import type {State,Signal} from './core';

export type AgentAction='BUY'|'SELL'|'HOLD';
export type Observation={
 schemaVersion:1;asOf:number;tradingMode:'paper_only';
 market:{solEur:number;receivedAt:number;ageMs:number}|null;
 latestSignal:Pick<Signal,'signature'|'wallet'|'time'|'detected'|'side'|'reason'>|null;
 health:{marketFresh:boolean;collectionRecent:boolean;knownGaps:number;pending:number};
};
export type ReflexProposal={schemaVersion:1;mode:'observe_only';action:AgentAction;confidence:number;reasonCodes:string[];asOf:number;signalSignature:string|null};
export type BrainReview={schemaVersion:1;mode:'observe_only';asOf:number;findings:{code:string;evidence:number|string|null}[];hypotheses:string[]};

const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const pending=(value:unknown)=>{
 if(!value||typeof value!=='object')return 0;
 const x=value as {signatures?:unknown;count?:unknown};
 return Array.isArray(x.signatures)?x.signatures.length:finite(x.count)&&x.count>=0?x.count:0;
};

/** Causal, read-only snapshot. Future observations are excluded rather than repaired. */
export function observationAt(state:State,asOf:number):Observation{
 if(!finite(asOf)||asOf<=0)throw Error('Instante de observação inválido');
 const signals=state.signals.filter(s=>finite(s.time)&&s.time<=asOf&&finite(s.detected)&&s.detected<=asOf&&s.side!=='ignore').sort((a,b)=>b.detected-a.detected);
 const market=state.market&&state.market.time<=asOf&&[state.market.sol,state.market.eurPerUsd,state.market.time].every(finite)
  ?{solEur:state.market.sol*state.market.eurPerUsd,receivedAt:state.market.time,ageMs:asOf-state.market.time}:null;
 return {schemaVersion:1,asOf,tradingMode:'paper_only',market,
  latestSignal:signals[0]?{signature:signals[0].signature,wallet:signals[0].wallet,time:signals[0].time,detected:signals[0].detected,side:signals[0].side,reason:signals[0].reason}:null,
  health:{marketFresh:!!market&&market.ageMs<=180000,collectionRecent:finite(state.lastSuccess)&&state.lastSuccess<=asOf&&asOf-state.lastSuccess<=7200000,
   knownGaps:state.wallets.filter(w=>w.gap).length,pending:state.wallets.reduce((n,w)=>n+pending(w.pending),0)}};
}

/** Deterministic baseline only. A proposal can never execute or bypass the risk engine. */
export function reflexBaseline(input:Observation):ReflexProposal{
 const reasons:string[]=[];
 if(!input.health.marketFresh)reasons.push('market_not_fresh');
 if(!input.health.collectionRecent)reasons.push('collection_not_recent');
 if(input.health.knownGaps)reasons.push('coverage_gaps');
 if(!input.latestSignal)reasons.push('no_supported_signal');
 const blocked=reasons.length>0;
 return {schemaVersion:1,mode:'observe_only',action:blocked?'HOLD':input.latestSignal!.side==='buy'?'BUY':'SELL',
  confidence:blocked?0:0.5,reasonCodes:blocked?reasons:['deterministic_supported_signal_baseline'],asOf:input.asOf,signalSignature:input.latestSignal?.signature??null};
}

/** Evidence summary for later research; it does not tune strategies or prompts. */
export function brainBaseline(input:Observation):BrainReview{
 const findings=[
  {code:'market_age_ms',evidence:input.market?.ageMs??null},
  {code:'known_coverage_gaps',evidence:input.health.knownGaps},
  {code:'pending_transactions',evidence:input.health.pending},
  {code:'latest_supported_signal',evidence:input.latestSignal?.signature??null},
 ];
 const hypotheses:string[]=[];
 if(input.health.knownGaps)hypotheses.push('Medir se as lacunas alteram a taxa de aceitação do parser.');
 if(input.health.pending)hypotheses.push('Comparar atraso da fila com sinais que ainda seriam temporalmente elegíveis.');
 if(!input.health.marketFresh)hypotheses.push('Quantificar ciclos bloqueados por frescura antes de alterar a frequência.');
 return {schemaVersion:1,mode:'observe_only',asOf:input.asOf,findings,hypotheses};
}
