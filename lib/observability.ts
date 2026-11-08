import {equity,type State,type Signal,type Portfolio,type SignalDecision,type DiagnosticDetails} from './core';

const parserCodes:Record<string,string>={
 'Transação falhada ou metadados indisponíveis':'parser_metadata_or_failed',
 'Carteira não é signatária':'parser_not_signer',
 'Transferência ou protocolo não suportado':'parser_unsupported_protocol',
 'Criação/fecho de conta: reconciliação de SOL nativo indisponível':'parser_account_lifecycle',
 'Sem alteração dos saldos SPL da carteira':'parser_no_balance_change',
 'Par ou fluxos fora do swap SOL/USDC suportado':'parser_unsupported_pair',
 'Fluxos SOL adicionais: operação ambígua':'parser_native_flow',
};
export const decisionLabels:Record<string,string>={
 historical_sample:'Amostra histórica; sem execução retroativa',
 source_time_invalid:'Hora de origem inválida',signal_too_old:'Sinal ultrapassou a idade máxima',
 market_stale:'Preço recebido há mais de 180 segundos',market_unavailable:'Dados de simulação indisponíveis',
 risk_drawdown:'Suspensão por drawdown',risk_daily_loss:'Limite de perda diária',risk_weekly_loss:'Limite de perda semanal',
 consistency_not_proven:'Amostra anterior insuficiente ou consistência não demonstrada',
 two_loss_suspension:'Suspensão do trader após duas perdas consecutivas',
 insufficient_cash_after_costs:'Saldo insuficiente após custos',below_virtual_minimum:'Montante abaixo do mínimo virtual',
 buy_accounting_rejected:'Compra recusada; consultar limites e duplicação',sell_accounting_rejected:'Venda recusada; consultar valores e duplicação',
 no_virtual_position:'Sem posição virtual deste trader',virtual_buy:'Compra exclusivamente virtual',virtual_sell:'Venda exclusivamente virtual',
 provider_unavailable:'Fonte indisponível',provider_cooldown:'Fonte em espera',provider_rate_limit:'Fonte limitou os pedidos',
 cycle_budget:'Orçamento de pedidos por ciclo atingido',daily_budget:'Orçamento diário atingido',
 quote_invalid_response:'Resposta da cotação incompleta',quote_invalid_route:'Cotação sem rota',quote_impact:'Impacto da cotação excede o limite',
 quote_mismatch:'Par ou montante da cotação não corresponde ao pedido',quote_expired:'Cotação expirada',
 cycle_interrupted:'Estratégia não avaliada após interrupção do ciclo',
};
const finite=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x);
const numberOrNull=(x:unknown)=>finite(x)?x:null;
const age=(time:unknown,now:number)=>finite(time)&&time>0&&time<=now?now-time:null;
const pendingCount=(pending:unknown)=>{
 if(!pending||typeof pending!=='object')return 0;
 const value=pending as {signatures?:unknown;count?:unknown};
 if(Array.isArray(value.signatures))return value.signatures.length;
 return finite(value.count)&&value.count>=0?value.count:0;
};

/** Only allowlisted evidence, never the raw RPC response or provider URLs. */
export function observeSignal(signal:Signal,tx:any,historical:boolean){
 const own=(balances:any)=>Array.isArray(balances)?balances.filter(b=>b?.owner===signal.wallet):[];
 const before=own(tx?.meta?.preTokenBalances),after=own(tx?.meta?.postTokenBalances);
 signal.audit={version:1,historical,parser:{
  code:signal.side==='ignore'?(parserCodes[signal.reason]||'parser_ambiguous'):'parser_supported_swap',
  slot:numberOrNull(tx?.slot),transactionVersion:tx?.version==='legacy'?'legacy':numberOrNull(tx?.version),
  signer:Array.isArray(tx?.transaction?.message?.accountKeys)&&tx.transaction.message.accountKeys.some((k:any)=>k?.pubkey===signal.wallet&&k.signer===true),
  preAccounts:before.length,postAccounts:after.length,
  invalidBalances:[...before,...after].filter(b=>!Number.isFinite(Number(b?.uiTokenAmount?.amount))||!Number.isInteger(b?.uiTokenAmount?.decimals)).length,
 },decisions:[]};
}

export function decision(s:State,signal:Signal,strategy:string|null,stage:SignalDecision['stage'],outcome:SignalDecision['outcome'],code:string,details:DiagnosticDetails={},now=Date.now()){
 if(!signal.audit)return; // Old observations are not retrospectively assigned decisions.
 const evidence:DiagnosticDetails={signalAgeMs:age(signal.time,now),marketReceiptAgeMs:age(s.market?.time,now),maxSignalAgeMs:s.config.maxAge*1000,maxMarketReceiptAgeMs:180000,...details};
 for(const key of Object.keys(evidence))if(typeof evidence[key]==='number'&&!Number.isFinite(evidence[key]))evidence[key]=null;
 signal.audit.decisions.push({strategy,stage,outcome,code,time:now,details:evidence});
}

/** Classify failures without persisting an arbitrary exception message or secret. */
export function failureCode(error:unknown){
 const e=error as {code?:string;message?:string};
 if(e?.code&&Object.hasOwn(decisionLabels,e.code)&&e.code.startsWith('quote_'))return e.code;
 const message=typeof e?.message==='string'?e.message:'';
 if(/429/.test(message))return 'provider_rate_limit';
 if(/em espera/.test(message))return 'provider_cooldown';
 if(/diário/.test(message))return 'daily_budget';
 if(/Orçamento de pedidos por ciclo/.test(message))return 'cycle_budget';
 if(/Cotação expirada/.test(message))return 'quote_expired';
 return 'provider_unavailable';
}

export function riskCode(reason:string){
 if(reason.includes('drawdown'))return 'risk_drawdown';
 if(reason.includes('diária'))return 'risk_daily_loss';
 if(reason.includes('semanal'))return 'risk_weekly_loss';
 if(reason.includes('Duas perdas'))return 'two_loss_suspension';
 return 'consistency_not_proven';
}

export function buyEvidence(p:Portfolio,s:State,signal:Signal,qty:number,spend:number,fee:number,price:number):DiagnosticDetails{
 const e=equity(p,price),wallet=p.positions.filter(x=>x.wallet===signal.wallet).reduce((n,x)=>n+x.qty*price,0),asset=p.positions.reduce((n,x)=>n+x.qty*price,0);
 return {qty,spendEur:spend,feeEstimateEur:fee,cashEur:p.cash,equityEur:e,walletExposureEur:wallet,assetExposureEur:asset,
  tradeLimitEur:e*s.config.perTrade/100,walletLimitEur:e*s.config.perTrader/100,assetLimitEur:e*s.config.perAsset/100,
  invalidQuantity:!finite(qty)||qty<=0,invalidSpend:!finite(spend)||spend<=0,invalidFee:!finite(fee)||fee<0,
  insufficientCash:spend+fee>p.cash,tradeLimitExceeded:spend+fee>e*s.config.perTrade/100+1e-6,
  walletLimitExceeded:wallet+spend+fee>e*s.config.perTrader/100,assetLimitExceeded:asset+spend+fee>e*s.config.perAsset/100,
  duplicate:p.trades.some(t=>t.signature===signal.signature&&t.wallet===signal.wallet)};
}

export function beginCycle(s:State,now:number){
 const t=s.telemetry??={since:now,completedCycles:0,failedCycles:0,marketBlockedCycles:0,consecutiveMarketBlocks:0,consecutiveFailures:0,lastCycle:{run:0,startedAt:now,finishedAt:null,outcome:'running',requests:null,failureCode:null}};
 t.lastCycle={run:s.runCount+1,startedAt:now,finishedAt:null,outcome:'running',requests:null,failureCode:null};
}
export function finishCycle(s:State,requests:number,outcome:'completed'|'market_blocked'|'failed',error?:unknown){
 const t=s.telemetry!;
 Object.assign(t.lastCycle,{finishedAt:Date.now(),requests:numberOrNull(requests),outcome,failureCode:error?failureCode(error):null});
 if(outcome==='failed'){t.failedCycles++;t.consecutiveFailures++;}
 else {t.completedCycles++;t.consecutiveFailures=0;if(outcome==='market_blocked'){t.marketBlockedCycles++;t.consecutiveMarketBlocks=(t.consecutiveMarketBlocks||0)+1;}else t.consecutiveMarketBlocks=0;}
}

function distribution(values:number[]){
 const x=values.filter(v=>finite(v)&&v>=0).sort((a,b)=>a-b);
 if(!x.length)return {n:0,p50:null,p95:null,max:null};
 const at=(p:number)=>x[Math.max(0,Math.ceil(x.length*p)-1)];
 return {n:x.length,p50:at(.5),p95:at(.95),max:x.at(-1)!};
}

/** Pure projection: reading metrics must never update risk, cursors or P/L. */
export function diagnostics(s:State,now=Date.now()){
 const lastSuccessAgeMs=age(s.lastSuccess,now),marketReceiptAgeMs=age(s.market?.time,now);
 const marketValuesValid=!!s.market&&[s.market.sol,s.market.eurPerUsd,s.market.usdcUsd].every(v=>finite(v)&&v>0);
 const valuationAvailable=marketValuesValid&&marketReceiptAgeMs!==null;
 const price=valuationAvailable?s.market!.sol*s.market!.eurPerUsd:null;
 const byCode:Record<string,number>={},audited=s.signals.filter(x=>x.audit),decisions=audited.flatMap(x=>x.audit!.decisions);
 for(const x of decisions)byCode[x.code]=(byCode[x.code]||0)+1;
 const parseable=s.signals.filter(x=>x.side!=='ignore');
 const portfolios=s.portfolios.map(p=>{
  const closed=p.trades.filter(t=>t.side==='sell'&&finite(t.pnl)),pnls=closed.map(t=>t.pnl as number);
  const marked=price===null?null:equity(p,price),currentDrawdownPct=marked===null||p.peak<=0?null:Math.max(0,(1-marked/p.peak)*100);
  let peak=s.config.capital,maxSnapshotDrawdownPct=0;
  for(const point of [...p.series].sort((a,b)=>a.time-b.time))if(finite(point.equity)){peak=Math.max(peak,point.equity);if(peak>0)maxSnapshotDrawdownPct=Math.max(maxSnapshotDrawdownPct,(1-point.equity/peak)*100);}
  const explicitCosts=p.trades.map(t=>t.cost).filter(finite);
  return {id:p.id,label:p.label,tradingMode:'paper_only' as const,trades:p.trades.length,closed:closed.length,
   wins:pnls.filter(v=>v>0).length,losses:pnls.filter(v=>v<0).length,breakEven:pnls.filter(v=>v===0).length,
   winRate:closed.length?pnls.filter(v=>v>0).length/closed.length:null,realizedPnlEur:pnls.reduce((n,v)=>n+v,0),
   equityEur:marked,totalPnlEur:marked===null?null:marked-s.config.capital,valuationStale:!valuationAvailable||marketReceiptAgeMs===null||marketReceiptAgeMs>180000,
   explicitEstimatedCostsEur:explicitCosts.reduce((n,v)=>n+v,0),tradesWithKnownExplicitCost:explicitCosts.length,
   embeddedVenueCostsEur:null,adverseHaircutBps:s.config.slippageBps,currentDrawdownPct,
   maxSnapshotDrawdownPct:p.series.length?maxSnapshotDrawdownPct:null,snapshotCount:p.series.length,
   haltedByDrawdown:p.halted,twoLossSuspensions:p.id==='two-loss'?Object.values(p.losses).filter(n=>n>=2).length:0,
   detectionLagMs:distribution(p.trades.map(t=>t.detected-t.sourceTime)),executionLagMs:distribution(p.trades.map(t=>t.time-t.sourceTime)),
  };
 });
 // A newer production format may have archives. Never claim they are in this snapshot.
 const extended=s as State&{archive?:{signals?:number;logs?:number;series?:Record<string,number>};archivedIgnored?:{count?:number}};
 const externalHistory=!!extended.archive||!!extended.archivedIgnored;
 const today=new Date(now).toISOString().slice(0,10);
 return {schemaVersion:1,tradingMode:'paper_only' as const,generatedAt:now,
  freshness:{lastSuccessAgeMs,collectionOlderThanTwoHours:lastSuccessAgeMs===null||lastSuccessAgeMs>7200000,
   marketReceiptAgeMs,marketReceiptValid:marketValuesValid&&marketReceiptAgeMs!==null,marketReceiptStale:marketReceiptAgeMs===null||marketReceiptAgeMs>180000,
   upstreamPriceAgeMs:null,upstreamPriceAgeVerified:false,sourceBlocks:s.market?.sourceBlocks??null,
   fxDate:s.market?.fxDate??null,fxCalendarAgeDays:s.market?.fxDate&&finite(Date.parse(s.market.fxDate))?Math.floor((now-Date.parse(s.market.fxDate))/86400000):null},
  coverage:{fullChainCoverage:null,completeHistory:false,currentLedgerObservations:s.signals.length,currentLedgerSupportedSwaps:parseable.length,
   parserAcceptanceInCurrentLedger:s.signals.length?parseable.length/s.signals.length:null,
   signalsWithStructuredAudit:audited.length,legacySignalsWithoutStructuredAudit:s.signals.length-audited.length,
   externalHistoryNotIncluded:externalHistory,pending:s.wallets.reduce((n,w)=>n+pendingCount(w.pending),0),
   detectionLagMs:distribution(s.signals.filter(x=>x.time>0).map(x=>x.detected-x.time)),
   wallets:s.wallets.map(w=>({address:w.address,knownGap:w.gap,observed:w.observed,supportedSwaps:w.swaps,
    pending:pendingCount(w.pending),pendingHistorical:w.pending?.historical??null,lastWindow:w.collectionWindow??null}))},
  decisions:{count:decisions.length,byCode,parserRejections:s.signals.filter(x=>x.side==='ignore').length,
   evaluatedSignals:audited.filter(x=>x.audit!.decisions.length>0).length},
  portfolios,
  requests:{utcDay:today,storedDay:s.callDay,usedToday:s.callDay===today?s.calls:0,dailyLimit:1500,cycleLimit:36,
   telemetry:s.telemetry??null},
  warnings:[
   ...(!marketValuesValid?[{code:'market_unavailable',severity:'critical' as const,message:'A cotação persistida está ausente ou contém valores inválidos.'}]:marketReceiptAgeMs===null||marketReceiptAgeMs>180000?[{code:'market_stale',severity:'warning' as const,message:'A cotação recebida ultrapassa os 180 segundos aceites pelo simulador.'}]:[]),
   ...(lastSuccessAgeMs===null||lastSuccessAgeMs>7200000?[{code:'collection_overdue',severity:'warning' as const,message:'Não existe uma recolha bem-sucedida confirmada nas últimas duas horas.'}]:[]),
   ...(s.wallets.some(w=>w.gap)?[{code:'coverage_gaps',severity:'warning' as const,message:'Existem carteiras com lacunas conhecidas; a amostra não representa o histórico completo.'}]:[]),
   ...(s.wallets.reduce((n,w)=>n+pendingCount(w.pending),0)>0?[{code:'pending_transactions',severity:'warning' as const,message:'Existem transações pendentes para ciclos posteriores.'}]:[]),
   ...(externalHistory?[{code:'external_history',severity:'warning' as const,message:'A produção refere arquivo externo; esta projeção não inclui o respetivo detalhe.'}]:[]),
  ],
  retention:{policy:'github_baseline',payloadUtf8Bytes:new TextEncoder().encode(JSON.stringify(s)).byteLength,providerTextLimitBytes:2000000,
   signals:s.signals.length,signalLimit:1500,logs:s.logs.length,logLimit:6000,
   snapshotLimitPerPortfolio:2000,reached:s.signals.length>=1500||s.logs.length>=6000||s.portfolios.some(p=>p.series.length>=2000),
   runtimeReconciliationRequired:externalHistory},
 };
}

/** Analysis export from the same persisted state; no provider calls or new decisions. */
export function researchExport(s:State,now=Date.now()){
 return {schemaVersion:1,kind:'edgewatch_research_snapshot',tradingMode:'paper_only',exportedAt:now,
  provenance:{observations:'real_finalized_rpc_sample',executions:'virtual_quote_based',money:'virtual_eur',
   historicalDecisionsReconstructed:false,fullChainHistory:false,containsCredentials:false},
  limitations:['Partial chain sample; full-chain coverage is unknown.','Price age uses response receipt; upstream age is unverified.',
   'Drawdown is observed at snapshots; intraperiod extremes are unknown.','Explicit costs are estimates; embedded venue fees are not separately reconstructed.',
   'This export contains the active ledger only; external archive details require the production archive export.'],
  config:{...s.config},metrics:diagnostics(s,now),
  observations:s.signals.map(x=>({signature:x.signature,wallet:x.wallet,sourceTime:x.time,detectedAt:x.detected,side:x.side,reason:x.reason,originalPriceUsdcPerSol:x.originalPrice,audit:x.audit??null})),
  virtualTrades:s.portfolios.flatMap(p=>p.trades),virtualPortfolios:s.portfolios,virtualBenchmark:s.benchmark,
 };
}
