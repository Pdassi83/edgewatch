import {reflexBaseline,type Observation} from './agents';
import {decisionRecord,researchLedger,type ResearchRecord,type VirtualQuote} from './research-ledger';

export type ExportObservation={signature:string;wallet:string;sourceTime:number;detectedAt:number;side:'buy'|'sell'|'ignore';reason:string};
export type ResearchSnapshot={schemaVersion:1;kind:'edgewatch_research_snapshot';tradingMode:'paper_only';provenance:{historicalDecisionsReconstructed:false;fullChainHistory:false;containsCredentials:false};observations:ExportObservation[]};
export type AlignedContext={wallet:string;signature:string;asOf:number;market:{receivedAt:number;solEur:number};lastSuccessAt:number;knownGaps:number;pending:number;quote?:VirtualQuote|null};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const key=(wallet:string,signature:string)=>`${wallet}:${signature}`;
const compareKey=(a:string,b:string)=>a<b?-1:a>b?1:0;

/** Converts an allowlisted export into deterministic records. Missing context becomes HOLD, never inferred data. */
export function adaptResearchSnapshot(snapshot:ResearchSnapshot,contexts:AlignedContext[]=[]){
 if(snapshot.schemaVersion!==1||snapshot.kind!=='edgewatch_research_snapshot'||snapshot.tradingMode!=='paper_only'||snapshot.provenance?.historicalDecisionsReconstructed!==false||snapshot.provenance?.fullChainHistory!==false||snapshot.provenance?.containsCredentials!==false||!Array.isArray(snapshot.observations))throw Error('Exportação incompatível');
 const contextByKey=new Map<string,AlignedContext>();
 for(const context of contexts){const k=key(context.wallet,context.signature);if(contextByKey.has(k))throw Error('Contexto alinhado duplicado');contextByKey.set(k,context);}
 const seen=new Set<string>(),records:ResearchRecord[]=[],unresolved:{wallet:string;signature:string;reason:string}[]=[];
 const observations=[...snapshot.observations].sort((a,b)=>a.detectedAt-b.detectedAt||compareKey(key(a.wallet,a.signature),key(b.wallet,b.signature)));
 for(const source of observations){
  if(!source||typeof source!=='object')throw Error('Observação histórica inválida');
  const k=key(source.wallet,source.signature);if(seen.has(k))throw Error('Observação histórica duplicada');seen.add(k);
  if(!source.wallet||!source.signature||!finite(source.sourceTime)||!finite(source.detectedAt)||source.sourceTime<=0||source.sourceTime>source.detectedAt||!['buy','sell','ignore'].includes(source.side)){throw Error('Observação histórica inválida');}
  const context=contextByKey.get(k);
  if(source.side==='ignore'){if(context)throw Error('Contexto associado a sinal ignorado');unresolved.push({wallet:source.wallet,signature:source.signature,reason:'unsupported_signal'});continue;}
  let observation:Observation,quote:VirtualQuote|null=null;
  if(!context){
   observation={schemaVersion:1,asOf:source.detectedAt,tradingMode:'paper_only',market:null,latestSignal:{signature:source.signature,wallet:source.wallet,time:source.sourceTime,detected:source.detectedAt,side:source.side,reason:source.reason},
    health:{contextComplete:false,marketFresh:false,collectionRecent:false,knownGaps:null,pending:null}};
   unresolved.push({wallet:source.wallet,signature:source.signature,reason:'historical_context_incomplete'});
  }else{
   if(context.wallet!==source.wallet||context.signature!==source.signature||context.asOf!==source.detectedAt||!finite(context.market?.receivedAt)||context.market.receivedAt>context.asOf||!finite(context.market.solEur)||context.market.solEur<=0||!finite(context.lastSuccessAt)||context.lastSuccessAt>context.asOf||!Number.isInteger(context.knownGaps)||context.knownGaps<0||!Number.isInteger(context.pending)||context.pending<0)throw Error('Contexto alinhado inválido');
   observation={schemaVersion:1,asOf:context.asOf,tradingMode:'paper_only',market:{solEur:context.market.solEur,receivedAt:context.market.receivedAt,ageMs:context.asOf-context.market.receivedAt},
    latestSignal:{signature:source.signature,wallet:source.wallet,time:source.sourceTime,detected:source.detectedAt,side:source.side,reason:source.reason},
    health:{contextComplete:true,marketFresh:context.asOf-context.market.receivedAt<=180000,collectionRecent:context.asOf-context.lastSuccessAt<=7200000,knownGaps:context.knownGaps,pending:context.pending}};
   quote=context.quote??null;if(!quote)unresolved.push({wallet:source.wallet,signature:source.signature,reason:'aligned_quote_missing'});
  }
  const proposal=reflexBaseline(observation),recordedAt=quote?.receivedAt??observation.asOf;
  records.push(decisionRecord(observation,proposal,proposal.action==='HOLD'?null:quote,recordedAt));
 }
 const unusedContexts=[...contextByKey.keys()].filter(k=>!seen.has(k));if(unusedContexts.length)throw Error('Contexto sem observação correspondente');
 return {schemaVersion:1,kind:'edgewatch_adapted_dataset',tradingMode:'paper_only' as const,ledger:researchLedger(records),unresolved,
  coverage:{exported:observations.length,records:records.length,ignored:unresolved.filter(x=>x.reason==='unsupported_signal').length,aligned:records.filter(r=>r.observation.health.contextComplete).length,quoted:records.filter(r=>!!r.quote).length}};
}
