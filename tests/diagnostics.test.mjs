import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeDiagnostics,SIMULATION_MARKET_MAX_AGE_MS} from '../lib/diagnostics.ts';

const NOW=1_800_000_000_000;
function fixture(){return {
 config:{interval:60},paused:false,status:'Recolha concluída',lastSuccess:NOW-60_000,
 market:{time:NOW-30_000},wallets:[],signals:[],portfolios:[],logs:[]
};}

test('preço fresco só durante 180 segundos; não confunde intervalo de recolha com validade da cotação',()=>{
 const state=fixture();
 state.market.time=NOW-SIMULATION_MARKET_MAX_AGE_MS;
 assert.equal(analyzeDiagnostics(state,NOW).market.validForSimulation,true);
 state.market.time--;
 const result=analyzeDiagnostics(state,NOW);
 assert.equal(result.market.status,'stale');
 assert.equal(result.market.validForSimulation,false);
 assert(result.warnings.some(w=>w.code==='market-not-fresh'));
});

test('data futura ou inválida nunca é cotação elegível',()=>{
 const state=fixture();state.market.time=NOW+1;
 assert.equal(analyzeDiagnostics(state,NOW).market.status,'invalid');
 state.market.time=NaN;
 assert.equal(analyzeDiagnostics(state,NOW).market.validForSimulation,false);
});

test('identifica lacunas, fila pendente e razões sem modificar o estado',()=>{
 const state=fixture();
 state.wallets=[{gap:true,pending:{signatures:['a','b']}},{gap:false,pending:null}];
 state.signals=[{side:'ignore',reason:'Par incompatível'},{side:'ignore',reason:'Par incompatível'},{side:'buy',reason:'ok'}];
 const original=JSON.stringify(state),result=analyzeDiagnostics(state,NOW);
 assert.equal(result.coverage.walletsWithGaps,1);
 assert.equal(result.coverage.pendingTransactions,2);
 assert.equal(result.coverage.supportedSignals,1);
 assert.deepEqual(result.coverage.ignoredReasons,[['Par incompatível',2]]);
 assert.equal(JSON.stringify(state),original);
});

test('ultrapassar limite de 1500 sinais gera alerta crítico, mesmo sem pausa',()=>{
 const state=fixture();state.signals=Array.from({length:1672},()=>({side:'ignore',reason:'x'}));
 const result=analyzeDiagnostics(state,NOW);
 assert.equal(result.storage.exhausted,true);
 assert.equal(result.storage.signalsUsed,1672);
 assert(result.warnings.some(w=>w.code==='storage-limit'&&w.severity==='critical'));
});

test('distingue recolha atrasada de uma experiência pausada',()=>{
 const state=fixture();state.lastSuccess=NOW-121*60_000;
 assert.equal(analyzeDiagnostics(state,NOW).collection.status,'overdue');
 state.paused=true;
 assert.equal(analyzeDiagnostics(state,NOW).collection.status,'paused');
});

test('sem primeira cotação ou recolha produz diagnósticos explícitos',()=>{
 const state=fixture();state.market=null;state.lastSuccess=null;
 const result=analyzeDiagnostics(state,NOW);
 assert.equal(result.market.status,'missing');
 assert.equal(result.collection.status,'never');
 assert.equal(result.market.ageSeconds,null);
});
