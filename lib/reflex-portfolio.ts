import {researchLedger,type ResearchRecord} from './research-ledger';

export type PortfolioConfig={initialCapitalEur:number;perTradePct:number};
export type VirtualPosition={wallet:string;qty:number;costBasisEur:number;openedAt:number;entryRecord:string};
export type PortfolioEvent={recordKey:string;time:number;action:'BUY'|'SELL';outcome:'executed_virtual'|'rejected';reason:string;wallet:string|null;qty:number;priceEur:number|null;costEur:number;realizedPnlEur:number|null};

const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const round=(x:number)=>Math.round(x*1e12)/1e12;

/** Offline accounting only: no providers, persistence, runner hooks, leverage or shorting. */
export function simulateReflexPortfolio(records:ResearchRecord[],config:PortfolioConfig={initialCapitalEur:100,perTradePct:10}){
 if(!finite(config.initialCapitalEur)||config.initialCapitalEur<=0||!finite(config.perTradePct)||config.perTradePct<=0||config.perTradePct>100)throw Error('Configuração da carteira virtual inválida');
 const ledger=researchLedger(records),executionOrder=[...ledger.records].sort((a,b)=>(a.quote?.receivedAt??a.recordedAt)-(b.quote?.receivedAt??b.recordedAt)||a.observation.asOf-b.observation.asOf),positions=new Map<string,VirtualPosition>(),lastPrice=new Map<string,number>(),events:PortfolioEvent[]=[];
 let cash=config.initialCapitalEur,realizedPnlEur=0,explicitCostsEur=0,peak=config.initialCapitalEur,maxDrawdownPct=0,holds=0;
 const consumedSignals=new Set<string>(),quoteSources={synthetic:0,recorded_provider_response:0};
 const equity=()=>cash+[...positions.values()].reduce((sum,p)=>sum+p.qty*(lastPrice.get(p.wallet)??p.costBasisEur/p.qty),0);
 const checkpoint=()=>{const value=equity();peak=Math.max(peak,value);if(peak>0)maxDrawdownPct=Math.max(maxDrawdownPct,(1-value/peak)*100);};
 for(const record of executionOrder){
  const {proposal,observation,quote}=record,signal=observation.latestSignal,key=`${observation.asOf}:${proposal.signalSignature??'none'}`;
  if(proposal.action==='HOLD'){holds++;checkpoint();continue;}
  const wallet=signal?.wallet??null,time=quote?.receivedAt??record.recordedAt,base={recordKey:key,time,action:proposal.action,wallet,qty:0,priceEur:quote?.priceEur??null,costEur:0,realizedPnlEur:null} as const;
  if(!wallet){events.push({...base,outcome:'rejected',reason:'missing_signal'});checkpoint();continue;}
  const signalKey=`${wallet}:${proposal.signalSignature}`;
  if(consumedSignals.has(signalKey)){events.push({...base,outcome:'rejected',reason:'duplicate_signal'});checkpoint();continue;}
  consumedSignals.add(signalKey);
  if(!quote){events.push({...base,outcome:'rejected',reason:'missing_quote'});checkpoint();continue;}
  quoteSources[quote.source]++;
  lastPrice.set(wallet,quote.priceEur);
  if(proposal.action==='BUY'){
   if(positions.has(wallet)){events.push({...base,outcome:'rejected',reason:'position_exists'});checkpoint();continue;}
   const notional=equity()*config.perTradePct/100,total=notional+quote.estimatedCostEur;
   if(!finite(notional)||notional<=0||total>cash){events.push({...base,outcome:'rejected',reason:'insufficient_cash'});checkpoint();continue;}
   const qty=notional/quote.priceEur;cash=round(cash-total);explicitCostsEur=round(explicitCostsEur+quote.estimatedCostEur);
   positions.set(wallet,{wallet,qty,costBasisEur:total,openedAt:time,entryRecord:key});events.push({...base,qty,priceEur:quote.priceEur,costEur:quote.estimatedCostEur,outcome:'executed_virtual',reason:'virtual_buy'});checkpoint();continue;
  }
  const position=positions.get(wallet);
  if(!position){events.push({...base,outcome:'rejected',reason:'no_virtual_position'});checkpoint();continue;}
  const proceeds=position.qty*quote.priceEur,pnl=proceeds-quote.estimatedCostEur-position.costBasisEur;
  if(cash+proceeds<quote.estimatedCostEur){events.push({...base,qty:position.qty,outcome:'rejected',reason:'insufficient_cash_for_exit_cost'});checkpoint();continue;}
  cash=round(cash+proceeds-quote.estimatedCostEur);realizedPnlEur=round(realizedPnlEur+pnl);explicitCostsEur=round(explicitCostsEur+quote.estimatedCostEur);positions.delete(wallet);
  events.push({...base,qty:position.qty,priceEur:quote.priceEur,costEur:quote.estimatedCostEur,realizedPnlEur:pnl,outcome:'executed_virtual',reason:'virtual_sell'});checkpoint();
 }
 const markedEquityEur=round(equity());
 const closed=events.filter(e=>e.outcome==='executed_virtual'&&e.action==='SELL'),rejectionsByReason:Record<string,number>={};
 for(const event of events)if(event.outcome==='rejected')rejectionsByReason[event.reason]=(rejectionsByReason[event.reason]||0)+1;
 return {schemaVersion:1,mode:'offline_paper_only' as const,initialCapitalEur:config.initialCapitalEur,cashEur:cash,markedEquityEur,totalPnlEur:round(markedEquityEur-config.initialCapitalEur),realizedPnlEur,
  explicitCostsEur,holds,events,positions:[...positions.values()],closedTrades:closed.length,wins:closed.filter(e=>(e.realizedPnlEur??0)>0).length,losses:closed.filter(e=>(e.realizedPnlEur??0)<0).length,
  winRate:closed.length?closed.filter(e=>(e.realizedPnlEur??0)>0).length/closed.length:null,rejectionsByReason,quoteSources,maxObservedDrawdownPct:maxDrawdownPct,
  limitations:['Open positions use the latest recorded quote for that wallet.','Drawdown is observed only at decision records.','Quotes and executions are exclusively virtual.']};
}
