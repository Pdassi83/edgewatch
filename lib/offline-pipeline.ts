import {createHash} from 'node:crypto';
import {adaptResearchSnapshot,type AlignedContext,type ResearchSnapshot} from './research-adapter';
import {simulateReflexPortfolio,type PortfolioConfig} from './reflex-portfolio';
import {comparisonReport,type EvaluationPolicy,type StrategyEvaluation} from './comparison-report';

export type OfflineDatasetProvenance={sourceKind:'synthetic_fixture'|'allowlisted_research_projection';containsCredentials:false};
export type OfflinePipelineInput={schemaVersion:2;kind:'edgewatch_offline_evaluation_input';datasetId:string;generatedAt:number;datasetProvenance:OfflineDatasetProvenance;snapshot:ResearchSnapshot;contexts:AlignedContext[];portfolioConfig:PortfolioConfig;strategies:StrategyEvaluation[];minimumClosedTrades?:number};

type JsonObject=Record<string,unknown>;
const MAX_ITEMS=100_000;
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const invalid=(path:string):never=>{throw Error(`Entrada offline inválida: ${path}`);};
const objectAt=(value:unknown,path:string,allowed:string[],required=allowed):JsonObject=>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid(path);
 const result=value as JsonObject,keys=Object.keys(result);
 if(keys.some(key=>!allowed.includes(key)))invalid(`${path}.campo_desconhecido`);
 if(required.some(key=>!Object.prototype.hasOwnProperty.call(result,key)))invalid(`${path}.campo_obrigatorio`);
 return result;
};
const stringAt=(value:unknown,path:string,max=256):string=>{if(typeof value!=='string'||!value.trim()||value.length>max)invalid(path);return value as string;};
const timestampAt=(value:unknown,path:string):number=>{if(!Number.isSafeInteger(value)||Number(value)<=0)invalid(path);return Number(value);};
const numberAt=(value:unknown,path:string):number=>{if(!finite(value))invalid(path);return value as number;};
const integerAt=(value:unknown,path:string):number=>{if(!Number.isSafeInteger(value)||Number(value)<0)invalid(path);return Number(value);};
const arrayAt=(value:unknown,path:string):unknown[]=>{if(!Array.isArray(value)||value.length>MAX_ITEMS)invalid(path);return value as unknown[];};
const enumAt=<T extends string>(value:unknown,path:string,allowed:readonly T[]):T=>{if(typeof value!=='string'||!allowed.includes(value as T))invalid(path);return value as T;};
const policyAt=(value:unknown,path:string)=>{
 if(!value||typeof value!=='object'||Array.isArray(value))invalid(path);const policy=value as JsonObject;
 for(const key of ['pricingPolicyId','costPolicyId','sizingPolicyId','riskPolicyId','valuationPolicyId']){
  if(!Object.prototype.hasOwnProperty.call(policy,key))invalid(`${path}.${key}`);stringAt(policy[key],`${path}.${key}`,128);
 }
};

/** Runtime validation for JSON input. It rejects silent defaults and unknown fields. */
export function validateOfflinePipelineInput(value:unknown):asserts value is OfflinePipelineInput{
 const input=objectAt(value,'input',['schemaVersion','kind','datasetId','generatedAt','datasetProvenance','snapshot','contexts','portfolioConfig','strategies','minimumClosedTrades'],['schemaVersion','kind','datasetId','generatedAt','datasetProvenance','snapshot','contexts','portfolioConfig','strategies']);
 if(input.schemaVersion!==2||input.kind!=='edgewatch_offline_evaluation_input')invalid('input.contrato');
 const datasetId=stringAt(input.datasetId,'input.datasetId',128);if(!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(datasetId))invalid('input.datasetId');
 timestampAt(input.generatedAt,'input.generatedAt');
 const provenance=objectAt(input.datasetProvenance,'input.datasetProvenance',['sourceKind','containsCredentials']);
 enumAt(provenance.sourceKind,'input.datasetProvenance.sourceKind',['synthetic_fixture','allowlisted_research_projection'] as const);if(provenance.containsCredentials!==false)invalid('input.datasetProvenance.containsCredentials');
 const snapshot=objectAt(input.snapshot,'input.snapshot',['schemaVersion','kind','tradingMode','provenance','observations']);
 if(snapshot.schemaVersion!==1||snapshot.kind!=='edgewatch_research_snapshot'||snapshot.tradingMode!=='paper_only')invalid('input.snapshot.contrato');
 const snapshotProvenance=objectAt(snapshot.provenance,'input.snapshot.provenance',['historicalDecisionsReconstructed','fullChainHistory','containsCredentials']);
 if(snapshotProvenance.historicalDecisionsReconstructed!==false||snapshotProvenance.fullChainHistory!==false||snapshotProvenance.containsCredentials!==false)invalid('input.snapshot.provenance');
 for(const [index,item] of arrayAt(snapshot.observations,'input.snapshot.observations').entries()){
  const path=`input.snapshot.observations[${index}]`,observation=objectAt(item,path,['signature','wallet','sourceTime','detectedAt','side','reason']);
  stringAt(observation.signature,`${path}.signature`);stringAt(observation.wallet,`${path}.wallet`);stringAt(observation.reason,`${path}.reason`,512);
  const sourceTime=timestampAt(observation.sourceTime,`${path}.sourceTime`),detectedAt=timestampAt(observation.detectedAt,`${path}.detectedAt`);
  if(sourceTime>detectedAt)invalid(path);enumAt(observation.side,`${path}.side`,['buy','sell','ignore'] as const);
 }
 for(const [index,item] of arrayAt(input.contexts,'input.contexts').entries()){
  const path=`input.contexts[${index}]`,context=objectAt(item,path,['wallet','signature','asOf','market','lastSuccessAt','knownGaps','pending','quote'],['wallet','signature','asOf','market','lastSuccessAt','knownGaps','pending']);
  stringAt(context.wallet,`${path}.wallet`);stringAt(context.signature,`${path}.signature`);const asOf=timestampAt(context.asOf,`${path}.asOf`),lastSuccessAt=timestampAt(context.lastSuccessAt,`${path}.lastSuccessAt`);integerAt(context.knownGaps,`${path}.knownGaps`);integerAt(context.pending,`${path}.pending`);
  const market=objectAt(context.market,`${path}.market`,['receivedAt','solEur']),marketReceivedAt=timestampAt(market.receivedAt,`${path}.market.receivedAt`);if(marketReceivedAt>asOf||lastSuccessAt>asOf)invalid(`${path}.cronologia`);if(numberAt(market.solEur,`${path}.market.solEur`)<=0)invalid(`${path}.market.solEur`);
  if(Object.prototype.hasOwnProperty.call(context,'quote')&&context.quote!==null){
   const quote=objectAt(context.quote,`${path}.quote`,['requestedAt','receivedAt','priceEur','estimatedCostEur','source']),requestedAt=timestampAt(quote.requestedAt,`${path}.quote.requestedAt`),receivedAt=timestampAt(quote.receivedAt,`${path}.quote.receivedAt`);
   if(requestedAt<asOf||receivedAt<requestedAt||numberAt(quote.priceEur,`${path}.quote.priceEur`)<=0||numberAt(quote.estimatedCostEur,`${path}.quote.estimatedCostEur`)<0)invalid(`${path}.quote`);enumAt(quote.source,`${path}.quote.source`,['synthetic','recorded_provider_response'] as const);
  }
 }
 const config=objectAt(input.portfolioConfig,'input.portfolioConfig',['initialCapitalEur','perTradePct']);
 if(numberAt(config.initialCapitalEur,'input.portfolioConfig.initialCapitalEur')<=0)invalid('input.portfolioConfig.initialCapitalEur');
 const perTradePct=numberAt(config.perTradePct,'input.portfolioConfig.perTradePct');if(perTradePct<=0||perTradePct>100)invalid('input.portfolioConfig.perTradePct');
 for(const [index,item] of arrayAt(input.strategies,'input.strategies').entries()){
  const path=`input.strategies[${index}]`,strategy=objectAt(item,path,['id','label','initialCapitalEur','totalPnlEur','realizedPnlEur','explicitCostsEur','closedTrades','signalKeys','windowStart','windowEnd','pricingPolicyId','costPolicyId','sizingPolicyId','riskPolicyId','valuationPolicyId','policyEvidence']);
  stringAt(strategy.id,`${path}.id`,128);stringAt(strategy.label,`${path}.label`,256);if(numberAt(strategy.initialCapitalEur,`${path}.initialCapitalEur`)<=0)invalid(`${path}.initialCapitalEur`);
  if(strategy.totalPnlEur!==null)numberAt(strategy.totalPnlEur,`${path}.totalPnlEur`);numberAt(strategy.realizedPnlEur,`${path}.realizedPnlEur`);if(numberAt(strategy.explicitCostsEur,`${path}.explicitCostsEur`)<0)invalid(`${path}.explicitCostsEur`);integerAt(strategy.closedTrades,`${path}.closedTrades`);
  const signalKeys=arrayAt(strategy.signalKeys,`${path}.signalKeys`);for(const [keyIndex,key] of signalKeys.entries())stringAt(key,`${path}.signalKeys[${keyIndex}]`,512);
  if(strategy.windowStart===null||strategy.windowEnd===null){if(strategy.windowStart!==null||strategy.windowEnd!==null)invalid(`${path}.window`);}else if(timestampAt(strategy.windowStart,`${path}.windowStart`)>timestampAt(strategy.windowEnd,`${path}.windowEnd`))invalid(`${path}.window`);
  policyAt(strategy,path);if(strategy.policyEvidence!=='declared_only')invalid(`${path}.policyEvidence`);
 }
 if(Object.prototype.hasOwnProperty.call(input,'minimumClosedTrades')&&(!Number.isSafeInteger(input.minimumClosedTrades)||Number(input.minimumClosedTrades)<1))invalid('input.minimumClosedTrades');
}

export function reflexPolicyFor(config:PortfolioConfig):EvaluationPolicy{
 return {pricingPolicyId:'aligned-virtual-quote-v1',costPolicyId:'explicit-quote-cost-v1',sizingPolicyId:`equity-${config.perTradePct}pct-notional-plus-cost-v1`,riskPolicyId:'long-only-one-position-per-wallet-v1',valuationPolicyId:'last-recorded-wallet-quote-v1'};
}

const canonicalJson=(value:unknown,stack=new Set<object>()):string=>{
 if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
 if(typeof value==='number'){if(!Number.isFinite(value))return invalid('input.valor_nao_json');return JSON.stringify(value);}
 if(value&&typeof value==='object'){
  if(stack.has(value))return invalid('input.valor_nao_json');stack.add(value);
  try{
   if(Array.isArray(value)){
    if(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)return invalid('input.valor_nao_json');const parts:string[]=[];
    for(let index=0;index<value.length;index++){const descriptor=Object.getOwnPropertyDescriptor(value,String(index));if(!descriptor||!Object.prototype.hasOwnProperty.call(descriptor,'value'))return invalid('input.valor_nao_json');parts.push(canonicalJson(descriptor.value,stack));}
    return `[${parts.join(',')}]`;
   }
   const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return invalid('input.valor_nao_json');const keys=Object.keys(value as JsonObject).sort();
   if(Reflect.ownKeys(value).length!==keys.length)return invalid('input.valor_nao_json');const parts:string[]=[];
   for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!descriptor.enumerable||!Object.prototype.hasOwnProperty.call(descriptor,'value'))return invalid('input.valor_nao_json');parts.push(`${JSON.stringify(key)}:${canonicalJson(descriptor.value,stack)}`);}
   return `{${parts.join(',')}}`;
  }finally{stack.delete(value);}
 }
 return invalid('input.valor_nao_json');
};
export const canonicalJsonSha256=(value:unknown)=>createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Complete deterministic offline flow. No network, persistence, scheduler or runner access. */
export function runOfflinePipeline(value:unknown){
 validateOfflinePipelineInput(value);const input=value,reflexPolicy=reflexPolicyFor(input.portfolioConfig);
 const adapted=adaptResearchSnapshot(input.snapshot,input.contexts);
 let latestEvidence=0;const includeEvidence=(time:number)=>{if(time>latestEvidence)latestEvidence=time;};
 for(const item of input.snapshot.observations)includeEvidence(item.detectedAt);
 for(const context of input.contexts){includeEvidence(context.asOf);includeEvidence(context.market.receivedAt);includeEvidence(context.lastSuccessAt);if(context.quote){includeEvidence(context.quote.requestedAt);includeEvidence(context.quote.receivedAt);}}
 for(const record of adapted.ledger.records){includeEvidence(record.observation.asOf);includeEvidence(record.recordedAt);if(record.quote)includeEvidence(record.quote.receivedAt);}
 for(const strategy of input.strategies)if(strategy.windowEnd!==null)includeEvidence(strategy.windowEnd);
 if(input.generatedAt<latestEvidence)invalid('input.generatedAt.corte_temporal');
 const portfolio=simulateReflexPortfolio(adapted.ledger.records,input.portfolioConfig);
 const report=comparisonReport({datasetId:input.datasetId,dataset:adapted,reflex:{initialCapitalEur:portfolio.initialCapitalEur,cashEur:portfolio.cashEur,markedEquityEur:portfolio.markedEquityEur,openPositions:portfolio.positions.length,totalPnlEur:portfolio.totalPnlEur,realizedPnlEur:portfolio.realizedPnlEur,explicitCostsEur:portfolio.explicitCostsEur,closedTrades:portfolio.closedTrades,wins:portfolio.wins,losses:portfolio.losses,winRate:portfolio.winRate,maxObservedDrawdownPct:portfolio.maxObservedDrawdownPct,events:portfolio.events,quoteSources:portfolio.quoteSources},reflexPolicy,strategies:input.strategies,minimumClosedTrades:input.minimumClosedTrades},input.generatedAt);
 return {schemaVersion:2,kind:'edgewatch_offline_evaluation_result',tradingMode:'paper_only' as const,datasetId:input.datasetId,generatedAt:input.generatedAt,
  manifest:{inputSchemaVersion:2,canonicalInputSha256:canonicalJsonSha256(input),sourceKind:input.datasetProvenance.sourceKind,credentialsDeclaration:'supplied_false_not_content_scanned' as const,engineVersions:{offlinePipeline:2,researchLedger:1,researchAdapter:1,reflexPortfolio:1,comparisonReport:2},effectivePortfolioConfig:{...input.portfolioConfig},effectiveReflexPolicy:reflexPolicy,strategyEvidence:'supplied_aggregates_not_independently_verified' as const},
  artifacts:{ledger:adapted.ledger,coverage:adapted.coverage,unresolved:adapted.unresolved,portfolio,report},
  guarantees:{networkAccess:false,persistence:false,runnerIntegration:false,schedulerChanges:false,financialExecution:false,credentialFieldsAccepted:false}};
}
