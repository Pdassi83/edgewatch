import type {ResearchRecord} from './research-ledger';

export type EvaluationPolicy={pricingPolicyId:string;costPolicyId:string;sizingPolicyId:string;riskPolicyId:string;valuationPolicyId:string};
export type StrategyEvaluation=EvaluationPolicy&{id:string;label:string;initialCapitalEur:number;totalPnlEur:number|null;realizedPnlEur:number;explicitCostsEur:number;closedTrades:number;signalKeys:string[];windowStart:number|null;windowEnd:number|null};
export type ComparisonInput={
 datasetId:string;
 dataset:{coverage:{exported:number;records:number;ignored:number;aligned:number;quoted:number};unresolved:{reason:string}[];ledger:{records:ResearchRecord[]}};
 reflex:{initialCapitalEur:number;cashEur:number;markedEquityEur:number;openPositions:number;totalPnlEur:number;realizedPnlEur:number;explicitCostsEur:number;closedTrades:number;wins:number;losses:number;winRate:number|null;maxObservedDrawdownPct:number;events:{recordKey:string;outcome:string;reason:string}[];quoteSources:Record<string,number>};
 reflexPolicy:EvaluationPolicy;strategies:StrategyEvaluation[];minimumClosedTrades?:number;
};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const signalKey=(r:ResearchRecord)=>`${r.observation.latestSignal?.wallet??'none'}:${r.proposal.signalSignature??'none'}`;
const sameSet=(a:Set<string>,b:Set<string>)=>a.size===b.size&&[...a].every(x=>b.has(x));
const validPolicy=(x:EvaluationPolicy)=>[x.pricingPolicyId,x.costPolicyId,x.sizingPolicyId,x.riskPolicyId,x.valuationPolicyId].every(v=>typeof v==='string'&&v.length>0);

/** Versioned evidence report. It can describe differences but never declares statistical superiority. */
export function comparisonReport(input:ComparisonInput,generatedAt:number){
 const minimum=input.minimumClosedTrades??20;
 if(!input.datasetId||!finite(generatedAt)||generatedAt<=0||!Number.isInteger(minimum)||minimum<1)throw Error('Parâmetros do relatório inválidos');
 const coverage=input.dataset.coverage;
 if(!validPolicy(input.reflexPolicy)||![coverage.exported,coverage.records,coverage.ignored,coverage.aligned,coverage.quoted].every(x=>Number.isInteger(x)&&x>=0)||coverage.records!==input.dataset.ledger.records.length||coverage.exported!==coverage.records+coverage.ignored||coverage.aligned>coverage.records||coverage.quoted>coverage.aligned)throw Error('Dataset ou políticas inválidos');
 if(!finite(input.reflex.initialCapitalEur)||input.reflex.initialCapitalEur<=0||![input.reflex.cashEur,input.reflex.markedEquityEur,input.reflex.totalPnlEur,input.reflex.realizedPnlEur,input.reflex.explicitCostsEur,input.reflex.maxObservedDrawdownPct].every(finite)||input.reflex.cashEur<0||input.reflex.markedEquityEur<0||input.reflex.explicitCostsEur<0||!Number.isInteger(input.reflex.openPositions)||input.reflex.openPositions<0||![input.reflex.closedTrades,input.reflex.wins,input.reflex.losses].every(x=>Number.isInteger(x)&&x>=0)||input.reflex.wins+input.reflex.losses>input.reflex.closedTrades||(input.reflex.winRate!==null&&(!finite(input.reflex.winRate)||input.reflex.winRate<0||input.reflex.winRate>1))||!Array.isArray(input.reflex.events))throw Error('Resultado REFLEX inválido');
 const expectedKeys=new Set(input.dataset.ledger.records.map(signalKey));
 if(expectedKeys.size!==input.dataset.ledger.records.length)throw Error('Dataset contém sinais duplicados');
 const times=input.dataset.ledger.records.map(r=>r.observation.asOf),windowStart=times.length?Math.min(...times):null,windowEnd=times.length?Math.max(...times):null;
 const actionable=input.dataset.ledger.records.filter(r=>r.proposal.action!=='HOLD'),unpriced=actionable.filter(r=>!r.quote).length;
 const proposals={BUY:0,SELL:0,HOLD:0};for(const record of input.dataset.ledger.records)proposals[record.proposal.action]++;
 const unresolvedByReason:Record<string,number>={};for(const item of input.dataset.unresolved)unresolvedByReason[item.reason]=(unresolvedByReason[item.reason]||0)+1;
 const commonReasons:string[]=[];
 if(!expectedKeys.size)commonReasons.push('empty_decision_universe');
 if(input.dataset.coverage.aligned<input.dataset.coverage.records)commonReasons.push('historical_context_incomplete');
 if(unpriced)commonReasons.push('reflex_actions_without_aligned_quote');
 const comparisons=input.strategies.map(strategy=>{
  const windowValid=(strategy.windowStart===null&&strategy.windowEnd===null)||(finite(strategy.windowStart)&&finite(strategy.windowEnd)&&strategy.windowStart<=strategy.windowEnd);
  if(!strategy.id||!strategy.label||!validPolicy(strategy)||!windowValid||!finite(strategy.initialCapitalEur)||strategy.initialCapitalEur<=0||!finite(strategy.realizedPnlEur)||!finite(strategy.explicitCostsEur)||strategy.explicitCostsEur<0||!Number.isInteger(strategy.closedTrades)||strategy.closedTrades<0||!Array.isArray(strategy.signalKeys)||strategy.signalKeys.some(x=>typeof x!=='string'||!x))throw Error('Resultado de estratégia inválido');
  const keys=new Set(strategy.signalKeys);if(keys.size!==strategy.signalKeys.length)throw Error('Estratégia contém sinais duplicados');
  const reasons=[...commonReasons];
  if(!sameSet(expectedKeys,keys))reasons.push('decision_universe_mismatch');
  if(strategy.initialCapitalEur!==input.reflex.initialCapitalEur)reasons.push('initial_capital_mismatch');
  if(strategy.pricingPolicyId!==input.reflexPolicy.pricingPolicyId)reasons.push('pricing_policy_mismatch');
  if(strategy.costPolicyId!==input.reflexPolicy.costPolicyId)reasons.push('cost_policy_mismatch');
  if(strategy.sizingPolicyId!==input.reflexPolicy.sizingPolicyId)reasons.push('sizing_policy_mismatch');
  if(strategy.riskPolicyId!==input.reflexPolicy.riskPolicyId)reasons.push('risk_policy_mismatch');
  if(strategy.valuationPolicyId!==input.reflexPolicy.valuationPolicyId)reasons.push('valuation_policy_mismatch');
  if(strategy.windowStart!==windowStart||strategy.windowEnd!==windowEnd)reasons.push('evaluation_window_mismatch');
  if(strategy.totalPnlEur===null||!finite(strategy.totalPnlEur))reasons.push('strategy_total_pnl_unavailable');
  const sampleThresholdMet=input.reflex.closedTrades>=minimum&&strategy.closedTrades>=minimum;
  if(!sampleThresholdMet)reasons.push('minimum_sample_threshold_not_met');
  const structural=reasons.some(r=>r!=='minimum_sample_threshold_not_met'),evidenceGrade=structural?'unusable':sampleThresholdMet?'descriptive':'limited';
  return {strategyId:strategy.id,label:strategy.label,evidenceGrade,comparable:evidenceGrade==='descriptive',sampleThresholdMet,reasons,
   reflex:{totalPnlEur:input.reflex.totalPnlEur,returnPct:input.reflex.totalPnlEur/input.reflex.initialCapitalEur*100,realizedPnlEur:input.reflex.realizedPnlEur,costsEur:input.reflex.explicitCostsEur,closedTrades:input.reflex.closedTrades},
   strategy:{totalPnlEur:strategy.totalPnlEur,returnPct:strategy.totalPnlEur===null?null:strategy.totalPnlEur/strategy.initialCapitalEur*100,realizedPnlEur:strategy.realizedPnlEur,costsEur:strategy.explicitCostsEur,closedTrades:strategy.closedTrades},
   differenceEur:evidenceGrade==='descriptive'&&strategy.totalPnlEur!==null?input.reflex.totalPnlEur-strategy.totalPnlEur:null,superiorityClaim:false};
 });
 const rejectedEvents=input.reflex.events.filter(e=>e.outcome==='rejected'),rejectedOpportunities=new Set(rejectedEvents.map(e=>e.recordKey)).size;
 return {schemaVersion:1,kind:'edgewatch_comparison_report',rulesVersion:1,tradingMode:'paper_only' as const,datasetId:input.datasetId,generatedAt,minimumClosedTrades:minimum,
  engineVersions:{researchLedger:1,researchAdapter:1,reflexPortfolio:1,comparisonReport:1},claimsAllowed:['descriptive'] as const,
  status:comparisons.some(x=>x.evidenceGrade==='descriptive')?'descriptive_only' as const:'inconclusive' as const,
  coverage:{...input.dataset.coverage,uniqueOpportunities:expectedKeys.size,proposals,actionableProposals:actionable.length,quotedActionableProposals:actionable.length-unpriced,alignedRate:input.dataset.coverage.records?input.dataset.coverage.aligned/input.dataset.coverage.records:null,quotedActionRate:actionable.length?(actionable.length-unpriced)/actionable.length:null,fullChainCoverage:null,unresolvedByReason},
  reflexSummary:{cashEur:input.reflex.cashEur,markedEquityEur:input.reflex.markedEquityEur,openPositions:input.reflex.openPositions,totalPnlEur:input.reflex.totalPnlEur,realizedPnlEur:input.reflex.realizedPnlEur,explicitCostsEur:input.reflex.explicitCostsEur,maxObservedDrawdownPct:input.reflex.maxObservedDrawdownPct,closedTrades:input.reflex.closedTrades,wins:input.reflex.wins,losses:input.reflex.losses,winRate:input.reflex.winRate,rejectedEvents:rejectedEvents.length,rejectedOpportunities,quoteAttemptsBySource:{...input.reflex.quoteSources}},comparisons,
  conclusion:'No statistical superiority claim. A descriptive difference is not evidence of future profitability.',
  limitations:['No confidence interval or significance test is inferred from trade counts alone.','Comparisons require identical signal universe, capital, pricing and cost policies.','Out-of-sample validation is not established by this report.']};
}
