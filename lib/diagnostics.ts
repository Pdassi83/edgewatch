import type {State} from './core';

// Keep this in sync with the simulation's price freshness guard in lib/runner.ts.
export const SIMULATION_MARKET_MAX_AGE_MS=180_000;
export const SIGNAL_STORAGE_LIMIT=1_500;
export const LOG_STORAGE_LIMIT=6_000;
export const SNAPSHOT_STORAGE_LIMIT=2_000;

type Warning={code:string;severity:'warning'|'critical';message:string};

/** Pure, read-only assessment. Never authorizes a trade or changes persisted state. */
export function analyzeDiagnostics(state:State,now=Date.now()){
 const warnings:Warning[]=[];
 const rawMarketAge=state.market?now-state.market.time:null;
 const marketAgeMs=rawMarketAge!==null&&Number.isFinite(rawMarketAge)?rawMarketAge:null;
 const marketStatus: 'missing'|'invalid'|'fresh'|'stale' =
  !state.market?'missing':marketAgeMs===null||marketAgeMs<0?'invalid':marketAgeMs<=SIMULATION_MARKET_MAX_AGE_MS?'fresh':'stale';
 if(marketStatus!=='fresh')warnings.push({code:'market-not-fresh',severity:marketStatus==='invalid'?'critical':'warning',message:marketStatus==='missing'?'Ainda não existe uma cotação de mercado validada.':marketStatus==='invalid'?'A cotação tem um carimbo temporal inválido ou posterior ao momento da análise.':'A última cotação ultrapassa os 3 minutos aceites pelo simulador.'});

 const rawCollectionAge=state.lastSuccess===null?null:now-state.lastSuccess;
 const collectionAgeMs=rawCollectionAge!==null&&Number.isFinite(rawCollectionAge)?rawCollectionAge:null;
 const collectionStatus:'never'|'paused'|'invalid'|'recent'|'overdue'=
  state.paused?'paused':state.lastSuccess===null?'never':collectionAgeMs===null||collectionAgeMs<0?'invalid':collectionAgeMs>2*state.config.interval*60_000?'overdue':'recent';
 if(collectionStatus==='overdue'||collectionStatus==='invalid')warnings.push({code:'collection-health',severity:'warning',message:collectionStatus==='overdue'?'A última recolha bem-sucedida ultrapassou dois intervalos configurados.':'O carimbo temporal da última recolha é inválido.'});

 const walletsWithGaps=state.wallets.filter(w=>w.gap).length;
 const pendingTransactions=state.wallets.reduce((sum,w)=>sum+(w.pending?.signatures.length||0),0);
 if(walletsWithGaps)warnings.push({code:'coverage-gaps',severity:'warning',message:walletsWithGaps+' carteira(s) têm lacunas de observação. O histórico não é completo.'});
 if(pendingTransactions)warnings.push({code:'pending-transactions',severity:'warning',message:pendingTransactions+' transação(ões) aguardam processamento.'});

 const reasons:Record<string,number>={};
 let supportedSignals=0;
 for(const signal of state.signals){if(signal.side==='ignore')reasons[signal.reason]=(reasons[signal.reason]||0)+1;else supportedSignals++;}
 const ignoredReasons=Object.entries(reasons).sort((a,b)=>b[1]-a[1]);
 const snapshotsUsed=Math.max(0,...state.portfolios.map(p=>p.series.length));
 const storage={signalsUsed:state.signals.length,signalsLimit:SIGNAL_STORAGE_LIMIT,logsUsed:state.logs.length,logsLimit:LOG_STORAGE_LIMIT,snapshotsUsed,snapshotsLimit:SNAPSHOT_STORAGE_LIMIT,exhausted:state.signals.length>=SIGNAL_STORAGE_LIMIT||state.logs.length>=LOG_STORAGE_LIMIT||snapshotsUsed>=SNAPSHOT_STORAGE_LIMIT};
 if(storage.exhausted)warnings.push({code:'storage-limit',severity:'critical',message:'Um limite de retenção foi atingido ou ultrapassado. Verificar o estado e o código em produção antes de novas recolhas; não eliminar o histórico.'});
 if(state.status==='Circuito interrompido')warnings.push({code:'circuit-interrupted',severity:'critical',message:'A última execução comunicou uma interrupção do circuito.'});

 return {
  market:{status:marketStatus,ageSeconds:marketAgeMs===null?null:Math.floor(marketAgeMs/1000),validForSimulation:marketStatus==='fresh'},
  collection:{status:collectionStatus,ageMinutes:collectionAgeMs===null?null:Math.floor(collectionAgeMs/60_000)},
  coverage:{trackedWallets:state.wallets.length,walletsWithGaps,pendingTransactions,observedSignals:state.signals.length,supportedSignals,ignoredSignals:state.signals.length-supportedSignals,ignoredReasons},
  storage,warnings
 };
}
