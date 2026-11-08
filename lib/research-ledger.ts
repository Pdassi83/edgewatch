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
 if(proposal.asOf!==observation.asOf)throw Error('Proposta e observação desalinhadas');
 if(proposal.signalSignature!==(observation.latestSignal?.signature??null))throw Error('Proposta não corresponde ao sinal observado');
 if(!finite(recordedAt)||recordedAt<observation.asOf)throw Error('Hora de registo inválida');
 if(quote){
  if(!finite(quote.requestedAt)||!finite(quote.receivedAt)||quote.requestedAt<observation.asOf||quote.receivedAt<quote.requestedAt||quote.receivedAt>recordedAt)throw Error('Cronologia da cotação inválida');
  if(!finite(quote.priceEur)||quote.priceEur<=0||!finite(quote.estimatedCostEur)||quote.estimatedCostEur<0)throw Error('Valores da cotação inválidos');
  if(proposal.action==='HOLD')throw Error('HOLD não recebe cotação de execução');
 }
 return {schemaVersion:1,kind:'edgewatch_decision_record',recordedAt,tradingMode:'paper_only',observation:structuredClone(observation),proposal:structuredClone(proposal),quote:quote?structuredClone(quote):null,
  provenance:{upstreamPriceAgeVerified:false,execution:'not_executed',credentialsIncluded:false}};
}

export function researchLedger(records:ResearchRecord[]){
 const ordered=[...records].sort((a,b)=>a.observation.asOf-b.observation.asOf),keys=new Set<string>();
 for(const record of ordered){
  if(record.schemaVersion!==1||record.kind!=='edgewatch_decision_record'||record.tradingMode!=='paper_only'||record.provenance.execution!=='not_executed')throw Error('Registo incompatível');
  const key=`${record.observation.asOf}:${record.proposal.signalSignature??'none'}`;if(keys.has(key))throw Error('Decisão duplicada');keys.add(key);
 }
 return {schemaVersion:1,kind:'edgewatch_research_ledger',tradingMode:'paper_only' as const,records:ordered,
  limitations:['Quotes are observations for virtual evaluation only.','Upstream price age is not verified.','No record authorizes or represents a financial transaction.']};
}
