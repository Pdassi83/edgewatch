import type {Observation,ReflexProposal} from './agents';

export type VirtualQuote={requestedAt:number;receivedAt:number;priceEur:number;estimatedCostEur:number;source:'synthetic'|'recorded_provider_response'};
export type ResearchRecord={
 schemaVersion:1;kind:'edgewatch_decision_record';recordedAt:number;tradingMode:'paper_only';
 observation:Observation;proposal:ReflexProposal;quote:VirtualQuote|null;
 provenance:{upstreamPriceAgeVerified:false;execution:'not_executed';credentialsIncluded:false};
};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);

/** Creates an allowlisted research record. It never persists state or executes a proposal. */
export function decisionRecord(observation:Observation,proposal:ReflexProposal,quote:VirtualQuote|null=null,recordedAt=Date.now()):ResearchRecord{
 if(observation.schemaVersion!==1||observation.tradingMode!=='paper_only'||!finite(observation.asOf)||observation.asOf<=0)throw Error('Observação incompatível');
 const known=observation.health?.knownGaps,pending=observation.health?.pending,countsKnown=Number.isInteger(known)&&Number(known)>=0&&Number.isInteger(pending)&&Number(pending)>=0;
 if(typeof observation.health?.contextComplete!=='boolean'||typeof observation.health.marketFresh!=='boolean'||typeof observation.health.collectionRecent!=='boolean'||(observation.health.contextComplete?!countsKnown:known!==null||pending!==null))throw Error('Saúde da observação inválida');
 if(observation.market&&(!finite(observation.market.receivedAt)||observation.market.receivedAt>observation.asOf||observation.market.ageMs!==observation.asOf-observation.market.receivedAt||!finite(observation.market.solEur)||observation.market.solEur<=0))throw Error('Mercado da observação inválido');
 if(observation.latestSignal&&(!finite(observation.latestSignal.time)||!finite(observation.latestSignal.detected)||observation.latestSignal.time>observation.latestSignal.detected||observation.latestSignal.detected>observation.asOf||observation.latestSignal.side==='ignore'))throw Error('Sinal futuro ou incompatível na observação');
 if(proposal.schemaVersion!==1||proposal.mode!=='observe_only'||!['BUY','SELL','HOLD'].includes(proposal.action)||!finite(proposal.confidence)||proposal.confidence<0||proposal.confidence>1||!Array.isArray(proposal.reasonCodes)||proposal.reasonCodes.some(x=>typeof x!=='string'))throw Error('Proposta incompatível');
 if(proposal.asOf!==observation.asOf)throw Error('Proposta e observação desalinhadas');
 if(proposal.signalSignature!==(observation.latestSignal?.signature??null))throw Error('Proposta não corresponde ao sinal observado');
 if(!finite(recordedAt)||recordedAt<observation.asOf)throw Error('Hora de registo inválida');
 if(quote){
  if(!finite(quote.requestedAt)||!finite(quote.receivedAt)||quote.requestedAt<observation.asOf||quote.receivedAt<quote.requestedAt||quote.receivedAt>recordedAt)throw Error('Cronologia da cotação inválida');
  if(!finite(quote.priceEur)||quote.priceEur<=0||!finite(quote.estimatedCostEur)||quote.estimatedCostEur<0)throw Error('Valores da cotação inválidos');
  if(!['synthetic','recorded_provider_response'].includes(quote.source))throw Error('Origem da cotação inválida');
  if(proposal.action==='HOLD')throw Error('HOLD não recebe cotação de execução');
 }
 return {schemaVersion:1,kind:'edgewatch_decision_record',recordedAt,tradingMode:'paper_only',observation:structuredClone(observation),proposal:structuredClone(proposal),quote:quote?structuredClone(quote):null,
  provenance:{upstreamPriceAgeVerified:false,execution:'not_executed',credentialsIncluded:false}};
}

export function researchLedger(records:ResearchRecord[]){
 const ordered=[...records].sort((a,b)=>a.observation.asOf-b.observation.asOf||a.recordedAt-b.recordedAt),keys=new Set<string>();
 for(const record of ordered){
  if(record.schemaVersion!==1||record.kind!=='edgewatch_decision_record'||record.tradingMode!=='paper_only'||record.provenance.execution!=='not_executed'||record.provenance.credentialsIncluded!==false||record.provenance.upstreamPriceAgeVerified!==false)throw Error('Registo incompatível');
  decisionRecord(record.observation,record.proposal,record.quote,record.recordedAt);
  const key=`${record.observation.asOf}:${record.observation.latestSignal?.wallet??'none'}:${record.proposal.signalSignature??'none'}`;if(keys.has(key))throw Error('Decisão duplicada');keys.add(key);
 }
 return {schemaVersion:1,kind:'edgewatch_research_ledger',tradingMode:'paper_only' as const,records:ordered,
  limitations:['Quotes are observations for virtual evaluation only.','Upstream price age is not verified.','No record authorizes or represents a financial transaction.']};
}
