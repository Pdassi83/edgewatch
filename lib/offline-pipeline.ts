import {adaptResearchSnapshot,type AlignedContext,type ResearchSnapshot} from './research-adapter';
import {simulateReflexPortfolio,type PortfolioConfig} from './reflex-portfolio';
import {comparisonReport,type EvaluationPolicy,type StrategyEvaluation} from './comparison-report';

export type OfflinePipelineInput={schemaVersion:1;kind:'edgewatch_offline_evaluation_input';datasetId:string;generatedAt:number;snapshot:ResearchSnapshot;contexts:AlignedContext[];portfolioConfig:PortfolioConfig;reflexPolicy:EvaluationPolicy;strategies:StrategyEvaluation[];minimumClosedTrades?:number};

/** Complete deterministic offline flow. No network, persistence, scheduler or runner access. */
export function runOfflinePipeline(input:OfflinePipelineInput){
 if(input.schemaVersion!==1||input.kind!=='edgewatch_offline_evaluation_input'||!input.datasetId||typeof input.generatedAt!=='number'||!Number.isFinite(input.generatedAt)||input.generatedAt<=0)throw Error('Entrada offline incompatível');
 const adapted=adaptResearchSnapshot(input.snapshot,input.contexts),portfolio=simulateReflexPortfolio(adapted.ledger.records,input.portfolioConfig);
 const report=comparisonReport({datasetId:input.datasetId,dataset:adapted,reflex:{initialCapitalEur:portfolio.initialCapitalEur,cashEur:portfolio.cashEur,markedEquityEur:portfolio.markedEquityEur,openPositions:portfolio.positions.length,totalPnlEur:portfolio.totalPnlEur,realizedPnlEur:portfolio.realizedPnlEur,explicitCostsEur:portfolio.explicitCostsEur,closedTrades:portfolio.closedTrades,wins:portfolio.wins,losses:portfolio.losses,winRate:portfolio.winRate,maxObservedDrawdownPct:portfolio.maxObservedDrawdownPct,events:portfolio.events,quoteSources:portfolio.quoteSources},reflexPolicy:input.reflexPolicy,strategies:input.strategies,minimumClosedTrades:input.minimumClosedTrades},input.generatedAt);
 return {schemaVersion:1,kind:'edgewatch_offline_evaluation_result',tradingMode:'paper_only' as const,datasetId:input.datasetId,generatedAt:input.generatedAt,
  artifacts:{ledger:adapted.ledger,coverage:adapted.coverage,unresolved:adapted.unresolved,portfolio,report},
  guarantees:{networkAccess:false,persistence:false,runnerIntegration:false,schedulerChanges:false,financialExecution:false}};
}
