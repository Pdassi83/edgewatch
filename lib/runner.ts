import {Providers} from './providers';
import {mutate,readState} from './store';
import {SOL,USDC,JUP,parseTx,candidateSignals,initPortfolios,equity,risk,sampleStats,buy,sell,log,validAddress,validateConfig,executionBlocked,type State,type Signal} from './core';
import {observeSignal,decision,decisionLabels,failureCode,riskCode,buyEvidence,beginCycle,finishCycle} from './observability';

function skipUnresolved(s:State,signal:Signal,code:string,stage:'market'|'quote'){
 for(const p of s.portfolios)if(!signal.audit?.decisions.some(d=>d.strategy===p.id))decision(s,signal,p.id,stage,'not_evaluated',code);
}
async function simulate(s:State,api:Providers,signal:Signal,feeSol:number){
 if(signal.side==='ignore')return;
 const block=executionBlocked(s,signal);
 if(block){log(s,`${signal.signature.slice(0,10)}: ${decisionLabels[block]}`);skipUnresolved(s,signal,block,'market');return;}
 const market=s.market!,price=market.sol*market.eurPerUsd,fx=market.eurPerUsd*market.usdcUsd;
 try{
 for(const p of s.portfolios){
  let blocked=risk(p,s.config,price,Date.now());
  if(signal.side==='buy'){
   let stats:ReturnType<typeof sampleStats>|null=null;
   if(p.id==='consistent'){
    const baseline=s.portfolios.find(x=>x.id==='simple')!;
    stats=sampleStats(baseline.trades.filter(t=>t.wallet===signal.wallet&&t.time<signal.detected));
    if(stats.n<20||stats.net<=0||(stats.score??0)<40)blocked='Amostra anterior insuficiente ou consistência não demonstrada';
   }
   if(p.id==='two-loss'&&(p.losses[signal.wallet]||0)>=2)blocked='Duas perdas consecutivas: suspensão do trader';
   if(blocked){
    log(s,`${p.label}: ${blocked}`);
    decision(s,signal,p.id,'risk','rejected',riskCode(blocked),{priorClosedTrades:stats?.n??null,priorNetEur:stats?.net??null,wilsonLowerPct:stats?.score??null,requiredClosedTrades:20,requiredWilsonLowerPct:40,consecutiveTraderLosses:p.losses[signal.wallet]||0,haltedByDrawdown:p.halted,equityEur:equity(p,price),peakEur:p.peak,dayStartEur:p.dayStart,weekStartEur:p.weekStart,dailyLossLimitPct:s.config.daily,weeklyLossLimitPct:s.config.weekly,drawdownLimitPct:s.config.drawdown});
    continue;
   }
   const e=equity(p,price),fee=(feeSol+0.00204)*price,budget=Math.min(p.cash,e*s.config.perTrade/100)-fee;
   if(budget<=0){log(s,`${p.label}: saldo insuficiente após custos`);decision(s,signal,p.id,'sizing','rejected','insufficient_cash_after_costs',{budgetEur:budget,feeEstimateEur:fee,cashEur:p.cash});continue;}
   const input=Math.floor(budget/fx*1e6);
   if(input<100000){log(s,`${p.label}: montante abaixo do mínimo virtual`);decision(s,signal,p.id,'sizing','rejected','below_virtual_minimum',{inputUsdcAtomic:input,minimumUsdcAtomic:100000});continue;}
   let q;
   try{q=await api.quote(USDC,SOL,String(input));}
   catch(error){decision(s,signal,p.id,'quote','rejected',failureCode(error),{inputUsdcAtomic:input,maxImpactPct:s.config.maxImpact});throw error;}
   const afterQuote=executionBlocked(s,signal);
   if(afterQuote){log(s,`${p.label}: ${decisionLabels[afterQuote]} após a cotação`);decision(s,signal,p.id,'market','rejected',afterQuote,{afterQuote:true});skipUnresolved(s,signal,afterQuote,'market');return;}
   const qty=Number(q.outAmount)/1e9*(1-s.config.slippageBps/10000),spend=input/1e6*fx;
   const evidence=buyEvidence(p,s,signal,qty,spend,fee,price),executed=buy(p,s.config,signal,qty,spend,fee,price,q,Date.now());
   decision(s,signal,p.id,'accounting',executed?'executed_virtual':'rejected',executed?'virtual_buy':'buy_accounting_rejected',evidence);
   if(!executed)log(s,`${p.label}: compra recusada por exposição/duplicação`);
  }else{
   const qty=p.positions.filter(x=>x.wallet===signal.wallet).reduce((a,x)=>a+x.qty,0);
   if(qty<=0){log(s,`${p.label}: venda ignorada; sem posição virtual nesta carteira`);decision(s,signal,p.id,'selection','rejected','no_virtual_position',{qty});continue;}
   const raw=Math.floor(qty*1e9);let q;
   try{q=await api.quote(SOL,USDC,String(raw));}
   catch(error){decision(s,signal,p.id,'quote','rejected',failureCode(error),{inputSolLamports:raw,maxImpactPct:s.config.maxImpact});throw error;}
   const afterQuote=executionBlocked(s,signal);
   if(afterQuote){log(s,`${p.label}: ${decisionLabels[afterQuote]} após a cotação`);decision(s,signal,p.id,'market','rejected',afterQuote,{afterQuote:true});skipUnresolved(s,signal,afterQuote,'market');return;}
   const proceeds=Number(q.outAmount)/1e6*fx*(1-s.config.slippageBps/10000),fee=feeSol*price;
   const evidence={qty,proceedsEur:proceeds,feeEstimateEur:fee,cashEur:p.cash,duplicate:p.trades.some(t=>t.signature===signal.signature&&t.wallet===signal.wallet)};
   const executed=sell(p,signal,proceeds,fee,q,Date.now(),s.config.slippageBps);
   decision(s,signal,p.id,'accounting',executed?'executed_virtual':'rejected',executed?'virtual_sell':'sell_accounting_rejected',evidence);
  }
 }
 }catch(error){skipUnresolved(s,signal,'cycle_interrupted','quote');throw error;}
}
export async function run(){return mutate(async s=>{const now=Date.now();if(s.paused)return {status:'Em pausa'};if(s.lastRun&&now-s.lastRun<s.config.interval*60000)return {status:'Intervalo mínimo ainda não decorrido',next:s.lastRun+s.config.interval*60000};if(s.signals.length>=1500||s.logs.length>=6000||s.portfolios.some(p=>p.series.length>=2000)){s.paused=true;log(s,'Limite de armazenamento da experiência. Exportar e iniciar nova versão; histórico preservado.');return {status:'Limite de segurança'};}beginCycle(s,now);s.lastRun=now;s.runCount++;const api=new Providers(s);try{
 // Verify chain before trusting any other source.
 const slot=await api.rpc('getSlot',[{commitment:'finalized'}]);if(!Number.isInteger(slot))throw Error('RPC sem slot válido');
 let marketError:string|null=null,fee=0;try{s.market=await api.market();fee=await api.feeSol();initPortfolios(s);if(!s.benchmark){const q=await api.quote(USDC,SOL,String(Math.floor((s.config.capital-(fee+.00204)*s.market.sol*s.market.eurPerUsd)/(s.market.eurPerUsd*s.market.usdcUsd)*1e6)));s.benchmark={qty:Number(q.outAmount)/1e9*(1-s.config.slippageBps/10000),cost:s.config.capital,time:Date.now()};}}catch(e){marketError=(e as Error).message;log(s,`Circuito de simulação fechado: ${marketError}`);}
 for(const w of s.wallets.slice(0,s.config.maxTraders)){
 if(!w.pending?.signatures.length){
  const items=await api.rpc('getSignaturesForAddress',[w.address,{limit:8,commitment:'finalized'}]);if(!Array.isArray(items))throw Error('Lista de assinaturas inválida');if(!items.length)continue;
  const first=!w.cursor,index=items.findIndex((x:any)=>x.signature===w.cursor);
  if(!first&&index<0){w.gap=true;log(s,`Lacuna de recolha em ${w.address.slice(0,8)}: janela de 8 transações excedida; sem reconstrução histórica`);}
  if((index<0?items.length:index)>4)w.gap=true;
  const eligible=index>=0?items.slice(0,index):items,selected=eligible.slice(0,4);
  w.collectionWindow={listedAt:Date.now(),limit:8,listed:items.length,cursorFound:first?null:index>=0,eligibleInWindow:eligible.length,queued:selected.length,omittedFromBatch:eligible.length-selected.length,windowMayBeTruncated:items.length>=8};
  w.pending={signatures:selected.reverse().map((x:any)=>x.signature),historical:first};
 }
 // Persist the bounded batch and its historical flag: failed requests resume without losing work.
 while(w.pending.signatures.length){
  const signature=w.pending.signatures[0];
  if(!s.signals.some(x=>x.wallet===w.address&&x.signature===signature)){
   const tx=await api.rpc('getTransaction',[signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:1,commitment:'finalized'}]);
   if(!tx)throw Error('Transação ainda indisponível; ciclo será retomado');
   const signal=parseTx(tx,w.address,signature);observeSignal(signal,tx,w.pending.historical);s.signals.push(signal);w.observed++;if(signal.side!=='ignore'){w.swaps++;w.validatedAt=Date.now();w.status='Swap compatível confirmado';}else{log(s,`${signature.slice(0,10)}: ignorada; ${signal.reason}`);if(!w.swaps)w.status='Sem swaps suportados';}
   // An observed signal is never replayed, including after a partial virtual simulation.
   w.cursor=signature;w.pending.signatures.shift();
   if(w.pending.historical){log(s,`${signature.slice(0,10)}: amostra histórica; sem execução retroativa`);if(signal.side!=='ignore')decision(s,signal,null,'selection','not_evaluated','historical_sample');}
   else if(!marketError)await simulate(s,api,signal,fee);
   else {log(s,`${signature.slice(0,10)}: ignorada; dados de execução indisponíveis`);if(signal.side!=='ignore')decision(s,signal,null,'market','not_evaluated','market_unavailable');}
  }else{w.cursor=signature;w.pending.signatures.shift();}
 }
 delete w.pending;
 }
 await discover(s,api);
 if(s.market&&!marketError){for(const p of s.portfolios){risk(p,s.config,s.market.sol*s.market.eurPerUsd,Date.now());p.series.push({time:Date.now(),equity:equity(p,s.market.sol*s.market.eurPerUsd)});}}
 for(const limit of Object.values(s.providerLimits||{})){if(limit.until<=Date.now())limit.failures=0;}s.lastSuccess=Date.now();s.status=marketError?'Recolha ativa · simulação bloqueada':'Recolha concluída';log(s,`Ciclo ${s.runCount}: slot ${slot}; ${api.calls} pedidos contabilizados`);finishCycle(s,api.calls,marketError?'market_blocked':'completed',marketError?Error(marketError):undefined);
 }catch(e){s.status='Circuito interrompido';log(s,(e as Error).message);finishCycle(s,api.calls,'failed',e);}return {status:s.status,wallets:s.wallets.length,signals:s.signals.length,lastSuccess:s.lastSuccess};});}
export async function action(body:any){if(body.action==='run')return run();if(body.action==='read')return readState();return mutate(async s=>{if(body.action==='pause'){s.paused=!s.paused;log(s,s.paused?'Pausa manual':'Retoma manual');}else if(body.action==='wallet'){const address=String(body.address||'').trim();if(!validAddress(address))throw Error('Endereço Solana inválido');if(s.wallets.some(w=>w.address===address))throw Error('Carteira já acompanhada');if(s.wallets.length>=s.config.maxTraders)throw Error('Limite de carteiras atingido');s.wallets.push({address,added:Date.now(),cursor:null,status:'Em observação',observed:0,swaps:0,gap:false});log(s,`Carteira ${address} adicionada para observação`);}else if(body.action==='config'){const c=validateConfig(body.config);if(s.portfolios.length&&c.capital!==s.config.capital)throw Error('Capital bloqueado após o início para preservar comparabilidade');s.config=c;log(s,'Limites atualizados. O intervalo é um mínimo; o agendamento cloud é independente.');}else throw Error('Ação desconhecida');return {ok:true};});}

export async function discover(s:State,api:Providers){
 if(s.wallets.length>=s.config.maxTraders)return;
 // Prioritize existing portfolios. Discovery shares the same request/day/time limits.
 if(api.calls>26){log(s,'Descoberta adiada: orçamento reservado à monitorização');return;}
 const d=s.discovery??={seen:[],scanned:0,rejected:0,lastScan:0,reasons:{}};
 const recent=await api.rpc('getSignaturesForAddress',[JUP,{limit:12,commitment:'finalized'}]);
 if(!Array.isArray(recent))throw Error('Lista de descoberta inválida');
 const items=recent.filter((x:any)=>typeof x.signature==='string'&&!d.seen.includes(x.signature)).slice(0,4);
 const scannedBefore=d.scanned;
 for(const item of items){
  if(s.wallets.length>=s.config.maxTraders)break;
  let reason='Transação falhada na origem';let candidates:Signal[]=[];let candidateTx:any=null;
  if(!item.err){
   const tx=await api.rpc('getTransaction',[item.signature,{encoding:'jsonParsed',maxSupportedTransactionVersion:1,commitment:'finalized'}]);
   if(!tx)throw Error('Transação de descoberta ainda indisponível');
   candidateTx=tx;candidates=candidateSignals(tx,item.signature);reason='Nenhum signatário com swap SOL/USDC suportado';
  }
  d.scanned++;d.lastScan=Date.now();d.seen.push(item.signature);d.seen=d.seen.slice(-64);
  if(!candidates.length){d.rejected++;d.reasons[reason]=(d.reasons[reason]||0)+1;continue;}
  for(const signal of candidates){
   if(s.wallets.length>=s.config.maxTraders)break;
   if(s.wallets.some(w=>w.address===signal.wallet))continue;
   // Discovery evidence is historical, never a paper order. Start following after this signature.
   s.wallets.push({address:signal.wallet,added:Date.now(),cursor:item.signature,status:'Swap compatível confirmado',validatedAt:Date.now(),observed:1,swaps:1,gap:true});
   observeSignal(signal,candidateTx,true);decision(s,signal,null,'selection','not_evaluated','historical_sample');s.signals.push(signal);
   log(s,`Carteira ${signal.wallet.slice(0,8)} selecionada: swap SOL/USDC confirmado; amostra histórica, sem execução retroativa; rentabilidade desconhecida`);
  }
 }
 log(s,`Descoberta: ${d.scanned-scannedBefore} transações candidatas nesta amostra; ${s.wallets.length}/${s.config.maxTraders} carteiras acompanhadas. Sem garantia de encontrar candidatos.`);
}
