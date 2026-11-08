import type {State} from './core';
import {observationAt,reflexBaseline,type AgentAction,type Observation} from './agents';

export type EvaluationFrame={asOf:number;state:State};
export type ReflexEvaluation={
 schemaVersion:1;mode:'offline_observation_only';frames:number;
 actions:Record<AgentAction,number>;blockedReasons:Record<string,number>;
 actionable:number;holdRate:number|null;pnlEur:null;pnlStatus:'unavailable_without_aligned_execution_prices';
};

/** Replays supplied snapshots in chronological order. It never reads providers or mutates a frame. */
export function evaluateReflex(frames:EvaluationFrame[]):ReflexEvaluation{
 const ordered=[...frames].sort((a,b)=>a.asOf-b.asOf);
 const seen=new Set<number>(),observations:Observation[]=[];
 for(const frame of ordered){
  if(seen.has(frame.asOf))throw Error('Frames duplicados no mesmo instante');
  seen.add(frame.asOf);observations.push(observationAt(frame.state,frame.asOf));
 }
 const actions:Record<AgentAction,number>={BUY:0,SELL:0,HOLD:0},blockedReasons:Record<string,number>={};
 for(const observation of observations){const proposal=reflexBaseline(observation);actions[proposal.action]++;for(const code of proposal.reasonCodes)if(proposal.action==='HOLD')blockedReasons[code]=(blockedReasons[code]||0)+1;}
 return {schemaVersion:1,mode:'offline_observation_only',frames:observations.length,actions,blockedReasons,
  actionable:actions.BUY+actions.SELL,holdRate:observations.length?actions.HOLD/observations.length:null,
  pnlEur:null,pnlStatus:'unavailable_without_aligned_execution_prices'};
}

/** Descriptive side-by-side view, deliberately not a counterfactual performance claim. */
export function compareWithExistingStrategies(state:State,reflex:ReflexEvaluation){
 return {schemaVersion:1,comparison:'descriptive_not_counterfactual' as const,
  reflex:{frames:reflex.frames,actionable:reflex.actionable,holds:reflex.actions.HOLD,pnlEur:null},
  strategies:state.portfolios.map(p=>({id:p.id,label:p.label,trades:p.trades.length,closed:p.trades.filter(t=>t.side==='sell'&&typeof t.pnl==='number').length,
   realizedPnlEur:p.trades.reduce((sum,t)=>sum+(typeof t.pnl==='number'?t.pnl:0),0)})),
  limitations:['Frames may not cover every historical signal.','REFLEX has no aligned quote/execution-price series, so its P/L is not computed.','Existing strategy results are forward-test observations, not a counterfactual on identical decisions.']};
}
