import {canonicalJsonSha256,validateOfflinePipelineInput,type OfflinePipelineInput} from './offline-pipeline';
import type {PortfolioConfig} from './reflex-portfolio';

type JsonObject=Record<string,unknown>;
export type ProjectionOptions={datasetId:string;portfolioConfig:PortfolioConfig};
type QuarantineReason='source_time_unavailable'|'source_time_after_detection'|'detection_after_export';

const MAX_ITEMS=100_000;
const SOURCE_CONTRACT='edgewatch_github_branch_research_export_v1' as const;
const ROOT_FIELDS=['schemaVersion','kind','tradingMode','exportedAt','provenance','limitations','config','metrics','observations','virtualTrades','virtualPortfolios','virtualBenchmark'];
const CONFIG_FIELDS=['capital','interval','maxTraders','perTrade','perTrader','perAsset','daily','weekly','drawdown','slippageBps','maxImpact','maxAge'];
const METRIC_FIELDS=['schemaVersion','tradingMode','generatedAt','freshness','coverage','decisions','portfolios','requests','warnings','retention'];
const OBSERVATION_FIELDS=['signature','wallet','sourceTime','detectedAt','side','reason','originalPriceUsdcPerSol','audit'];
const DISCARDED_SECTIONS=['limitations','config','metrics','virtualTrades','virtualPortfolios','virtualBenchmark','observations.originalPriceUsdcPerSol','observations.audit'] as const;
const PROJECTION_LIMITATIONS=['No historical context or aligned quote is reconstructed.','Current metrics, virtual trades and original prices are not execution evidence for REFLEX.','This source contract is not production v10 compatibility.'] as const;
const incompatible=(code:string):never=>{throw Error(`Exportação da branch incompatível: ${code}`);};
const objectAt=(value:unknown,code:string,fields?:readonly string[]):JsonObject=>{
 if(!value||typeof value!=='object'||Array.isArray(value))incompatible(code);
 const result=value as JsonObject;if(fields&&(Object.keys(result).some(key=>!fields.includes(key))||fields.some(key=>!Object.prototype.hasOwnProperty.call(result,key))))incompatible(code);
 return result;
};
const arrayAt=(value:unknown,code:string):unknown[]=>{if(!Array.isArray(value)||value.length>MAX_ITEMS)incompatible(code);return value as unknown[];};
const textAt=(value:unknown,code:string,max=512):string=>{if(typeof value!=='string'||!value.trim()||value.length>max)incompatible(code);return value as string;};
const timeAt=(value:unknown,code:string,allowZero=false):number=>{if(!Number.isSafeInteger(value)||Number(value)<(allowZero?0:1))incompatible(code);return Number(value);};
const finiteAt=(value:unknown,code:string):number=>{if(typeof value!=='number'||!Number.isFinite(value))incompatible(code);return value as number;};
const enumAt=<T extends string>(value:unknown,code:string,allowed:readonly T[]):T=>{if(typeof value!=='string'||!allowed.includes(value as T))incompatible(code);return value as T;};
const increment=(counts:Record<string,number>,reason:QuarantineReason)=>{counts[reason]=(counts[reason]??0)+1;};

/** Allowlisted projection of this GitHub branch's export. It does not recognize production v10. */
export function projectKnownBranchResearchExport(raw:unknown,options:ProjectionOptions){
 if(!options||typeof options!=='object')incompatible('projection_options');
 const source=objectAt(raw,'source_envelope',ROOT_FIELDS);
 if(source.schemaVersion!==1||source.kind!=='edgewatch_research_snapshot'||source.tradingMode!=='paper_only')incompatible('source_contract');
 const exportedAt=timeAt(source.exportedAt,'exportedAt'),provenance=objectAt(source.provenance,'provenance',['observations','executions','money','historicalDecisionsReconstructed','fullChainHistory','containsCredentials']);
 if(provenance.observations!=='real_finalized_rpc_sample'||provenance.executions!=='virtual_quote_based'||provenance.money!=='virtual_eur'||provenance.historicalDecisionsReconstructed!==false||provenance.fullChainHistory!==false||provenance.containsCredentials!==false)incompatible('provenance');
 for(const item of arrayAt(source.limitations,'limitations'))textAt(item,'limitations');
 const sourceConfig=objectAt(source.config,'config',CONFIG_FIELDS);for(const field of CONFIG_FIELDS)finiteAt(sourceConfig[field],`config.${field}`);
 const metrics=objectAt(source.metrics,'metrics',METRIC_FIELDS);if(metrics.schemaVersion!==1||metrics.tradingMode!=='paper_only'||metrics.generatedAt!==exportedAt)incompatible('metrics_contract');
 const coverage=objectAt(metrics.coverage,'metrics.coverage'),retention=objectAt(metrics.retention,'metrics.retention');
 if(typeof coverage.externalHistoryNotIncluded!=='boolean'||retention.policy!=='github_baseline'||typeof retention.runtimeReconciliationRequired!=='boolean'||coverage.externalHistoryNotIncluded!==retention.runtimeReconciliationRequired)incompatible('metrics_reconciliation');
 arrayAt(source.virtualTrades,'virtualTrades');arrayAt(source.virtualPortfolios,'virtualPortfolios');if(source.virtualBenchmark!==null) objectAt(source.virtualBenchmark,'virtualBenchmark');
 const observations=arrayAt(source.observations,'observations'),projected:OfflinePipelineInput['snapshot']['observations']=[],seen=new Set<string>(),quarantineByReason:Record<string,number>={};
 for(const [index,item] of observations.entries()){
  const path=`observations[${index}]`,observation=objectAt(item,path,OBSERVATION_FIELDS),signature=textAt(observation.signature,`${path}.signature`,256),wallet=textAt(observation.wallet,`${path}.wallet`,256),reason=textAt(observation.reason,`${path}.reason`),side=enumAt(observation.side,`${path}.side`,['buy','sell','ignore'] as const),sourceTime=timeAt(observation.sourceTime,`${path}.sourceTime`,true),detectedAt=timeAt(observation.detectedAt,`${path}.detectedAt`),key=`${wallet}:${signature}`;
  if(seen.has(key))incompatible('duplicate_observation');seen.add(key);
  if(observation.originalPriceUsdcPerSol!==null&&finiteAt(observation.originalPriceUsdcPerSol,`${path}.originalPriceUsdcPerSol`)<=0)incompatible(`${path}.originalPriceUsdcPerSol`);
  if(observation.audit!==null)objectAt(observation.audit,`${path}.audit`);
  let quarantine:QuarantineReason|null=null;if(sourceTime===0)quarantine='source_time_unavailable';else if(sourceTime>detectedAt)quarantine='source_time_after_detection';else if(detectedAt>exportedAt)quarantine='detection_after_export';
  if(quarantine){increment(quarantineByReason,quarantine);continue;}
  projected.push({signature,wallet,sourceTime,detectedAt,side,reason});
 }
 const input:OfflinePipelineInput={schemaVersion:2,kind:'edgewatch_offline_evaluation_input',datasetId:options.datasetId,generatedAt:exportedAt,datasetProvenance:{sourceKind:'allowlisted_research_projection',containsCredentials:false},snapshot:{schemaVersion:1,kind:'edgewatch_research_snapshot',tradingMode:'paper_only',provenance:{historicalDecisionsReconstructed:false,fullChainHistory:false,containsCredentials:false},observations:projected},contexts:[],portfolioConfig:{...options.portfolioConfig},strategies:[]};
 validateOfflinePipelineInput(input);
 const projectionManifest={projectionVersion:1,sourceContract:SOURCE_CONTRACT,sourceCanonicalSha256:canonicalJsonSha256(raw),projectedInputSha256:canonicalJsonSha256(input),sourceExportedAt:exportedAt,sourceObservations:observations.length,projectedObservations:projected.length,projectedIgnored:projected.filter(item=>item.side==='ignore').length,quarantinedObservations:observations.length-projected.length,quarantineByReason,externalHistoryDeclared:coverage.externalHistoryNotIncluded,discardedSections:[...DISCARDED_SECTIONS],credentialsDeclaration:'source_declared_false_not_content_scanned' as const,limitations:[...PROJECTION_LIMITATIONS]};
 return {schemaVersion:1,kind:'edgewatch_offline_projection_result' as const,input,projectionManifest};
}

/** Checks the saved wrapper's structural consistency. Checksums do not authenticate the missing source export. */
export function offlineProjectionForEvaluation(value:unknown):{input:OfflinePipelineInput;projectionManifest:JsonObject}{
 const result=objectAt(value,'projection_envelope',['schemaVersion','kind','input','projectionManifest']);if(result.schemaVersion!==1||result.kind!=='edgewatch_offline_projection_result')incompatible('projection_contract');
 validateOfflinePipelineInput(result.input);const input=result.input,manifest=objectAt(result.projectionManifest,'projection_manifest',['projectionVersion','sourceContract','sourceCanonicalSha256','projectedInputSha256','sourceExportedAt','sourceObservations','projectedObservations','projectedIgnored','quarantinedObservations','quarantineByReason','externalHistoryDeclared','discardedSections','credentialsDeclaration','limitations']);
 if(manifest.projectionVersion!==1||manifest.sourceContract!==SOURCE_CONTRACT||manifest.sourceExportedAt!==input.generatedAt||input.datasetProvenance.sourceKind!=='allowlisted_research_projection'||manifest.projectedInputSha256!==canonicalJsonSha256(input)||typeof manifest.sourceCanonicalSha256!=='string'||!/^[a-f0-9]{64}$/.test(manifest.sourceCanonicalSha256)||manifest.credentialsDeclaration!=='source_declared_false_not_content_scanned'||typeof manifest.externalHistoryDeclared!=='boolean')incompatible('projection_manifest');
 const sourceCount=timeAt(manifest.sourceObservations,'projection_manifest.counts',true),projectedCount=timeAt(manifest.projectedObservations,'projection_manifest.counts',true),ignoredCount=timeAt(manifest.projectedIgnored,'projection_manifest.counts',true),quarantinedCount=timeAt(manifest.quarantinedObservations,'projection_manifest.counts',true);
 if(sourceCount>MAX_ITEMS||projectedCount>MAX_ITEMS||quarantinedCount>MAX_ITEMS||sourceCount!==projectedCount+quarantinedCount||projectedCount!==input.snapshot.observations.length||ignoredCount!==input.snapshot.observations.filter(item=>item.side==='ignore').length)incompatible('projection_counts');
 const quarantine=objectAt(manifest.quarantineByReason,'projection_manifest.quarantine'),quarantineValues=Object.values(quarantine);if(Object.keys(quarantine).some(key=>!['source_time_unavailable','source_time_after_detection','detection_after_export'].includes(key))||quarantineValues.some(value=>!Number.isSafeInteger(value)||Number(value)<1)||quarantineValues.map(Number).reduce((sum,value)=>sum+value,0)!==quarantinedCount)incompatible('projection_quarantine');
 if(!Array.isArray(manifest.discardedSections)||JSON.stringify(manifest.discardedSections)!==JSON.stringify(DISCARDED_SECTIONS)||!Array.isArray(manifest.limitations)||JSON.stringify(manifest.limitations)!==JSON.stringify(PROJECTION_LIMITATIONS))incompatible('projection_manifest');
 if(input.contexts.length!==0||input.strategies.length!==0||Object.prototype.hasOwnProperty.call(input,'minimumClosedTrades')||input.snapshot.observations.some(item=>item.detectedAt>input.generatedAt))incompatible('projection_shape');
 const observationKeys=new Set(input.snapshot.observations.map(item=>`${item.wallet}:${item.signature}`));if(observationKeys.size!==input.snapshot.observations.length)incompatible('projection_shape');
 return {input,projectionManifest:manifest};
}

/** Returns only the strict v2 input after checking the projection wrapper. */
export function offlineInputFromProjection(value:unknown):OfflinePipelineInput{return offlineProjectionForEvaluation(value).input;}
