import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial,initPortfolios,SOL,USDC,JUP} from '../lib/core.ts';
import {encode,core,observability} from './helpers/modules.mjs';
const wallet='11111111111111111111111111111111';
const provider=`class Providers {
 calls=0;constructor(s){this.s=s}
 async rpc(method,params){this.calls++;const f=globalThis.labFixture;f.methods.push(method);
  if(f.rpcFailure)throw Error('synthetic RPC failure');if(method==='getSlot')return 123;
  if(method==='getSignaturesForAddress')return f.signatures.map(signature=>({signature}));
  return f.transaction();
 }
 async market(){if(globalThis.labFixture.marketFailure)throw Error('synthetic market failure');return {...globalThis.labFixture.market};}
 async feeSol(){return .00005}
 async quote(input,output,amount){const f=globalThis.labFixture;f.quotes++;if(f.quoteFailure)throw f.quoteFailure;f.now+=f.quoteDelay;return {outAmount:input==='${USDC}'?String(Math.floor(Number(amount)*10)):String(Math.floor(Number(amount)/10)),receivedAt:f.now};}
}`;
const source=fs.readFileSync('lib/runner.ts','utf8').replace("import {Providers} from './providers';",provider).replace("import {mutate,readState} from './store';","const mutate=async fn=>fn(globalThis.labState);const readState=async()=>globalThis.labState;").replace("from './core'",`from '${core}'`).replace("from './observability'",`from '${observability}'`);
const {run}=await import(encode(source));
function setup(t){
 const original=Date.now;globalThis.labFixture={now:Date.parse('2026-11-07T12:00:00Z'),methods:[],quotes:0,quoteDelay:0,signatures:['synthetic-new','synthetic-cursor']};Date.now=()=>labFixture.now;t.after(()=>Date.now=original);
 const f=labFixture;f.market={sol:100,eurPerUsd:1,usdcUsd:1,fxDate:'2026-11-06',time:f.now};
 f.transaction=()=>{
  const b=(mint,amount,i)=>({owner:wallet,mint,accountIndex:i,uiTokenAmount:{amount:String(amount),decimals:mint===SOL?9:6}});
  return {blockTime:Math.floor((f.sourceTime??f.now)/1000),slot:123,version:0,transaction:{message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:[{programId:JUP}]}},meta:{err:null,preTokenBalances:[b(SOL,1e9,0),b(USDC,2e8,1)],postTokenBalances:[b(SOL,1.1e9,0),b(USDC,1.9e8,1)]}};
 };
 globalThis.labState=initial();const s=labState;s.config.maxTraders=1;s.wallets=[{address:wallet,added:f.now-3600000,cursor:'synthetic-cursor',status:'fixture',observed:0,swaps:0,gap:false}];s.benchmark={qty:1,cost:100,time:f.now};initPortfolios(s);return [s,f];
}
test('cada estratégia recebe uma decisão auditável mantendo as compras virtuais previstas',async t=>{
 const [s,f]=setup(t);await run();const a=s.signals[0].audit;
 assert.equal(a.historical,false);assert.deepEqual(a.decisions.map(x=>[x.strategy,x.code]),[['simple','virtual_buy'],['consistent','consistency_not_proven'],['two-loss','virtual_buy']]);
 assert.equal(s.portfolios[0].trades.length,1);assert.equal(s.portfolios[1].trades.length,0);assert.equal(s.portfolios[2].trades.length,1);assert.equal(f.quotes,2);
 assert.equal(s.telemetry.lastCycle.outcome,'completed');assert.equal(s.telemetry.completedCycles,1);
});
test('limites de idade são reaplicados depois da cotação sem criar a operação',async t=>{
 const [s,f]=setup(t);f.quoteDelay=180001;await run();assert(s.portfolios.every(p=>p.trades.length===0));
 assert.equal(s.signals[0].audit.decisions[0].code,'market_stale');assert.equal(s.signals[0].audit.decisions[0].details.afterQuote,true);assert.equal(f.quotes,1);
 assert.equal(s.signals[0].audit.decisions.filter(x=>x.outcome==='not_evaluated').length,2);
});
test('sinal que envelhece durante a cotação não contorna maxAge',async t=>{
 const [s,f]=setup(t);f.sourceTime=f.now-s.config.maxAge*1000;f.quoteDelay=1;await run();assert.equal(s.signals[0].audit.decisions[0].code,'signal_too_old');assert(s.portfolios.every(p=>p.trades.length===0));
});
test('venda também revalida frescura após a cotação e conserva posição em caso de bloqueio',async t=>{
 const [s,f]=setup(t);const original=f.transaction;f.transaction=()=>{const x=original();[x.meta.preTokenBalances,x.meta.postTokenBalances]=[x.meta.postTokenBalances,x.meta.preTokenBalances];return x;};s.portfolios[0].positions=[{wallet,qty:.09,cost:9,opened:f.now-1000}];s.portfolios[0].cash=91;f.quoteDelay=180001;
 await run();assert.equal(s.portfolios[0].positions.length,1);assert.equal(s.portfolios[0].trades.length,0);assert.equal(s.signals[0].audit.decisions[0].code,'market_stale');
});
test('suspensões por risco e consistência produzem motivos distintos sem pedir cotações',async t=>{
 const [s,f]=setup(t);s.portfolios[0].halted=true;s.portfolios[2].losses[wallet]=2;await run();assert.deepEqual(s.signals[0].audit.decisions.map(x=>x.code),['risk_drawdown','consistency_not_proven','two_loss_suspension']);assert.equal(f.quotes,0);
});
test('cotação rejeitada distingue a estratégia afetada das que não chegaram a ser avaliadas',async t=>{
 const [s,f]=setup(t);f.quoteFailure=Object.assign(Error('synthetic failure'),{code:'quote_impact'});await run();
 const d=s.signals[0].audit.decisions;assert.equal(d[0].code,'quote_impact');assert.equal(d[0].outcome,'rejected');assert(d.slice(1).every(x=>x.code==='cycle_interrupted'&&x.outcome==='not_evaluated'));assert.equal(s.telemetry.failedCycles,1);assert.equal(s.telemetry.consecutiveFailures,1);assert.equal(s.status,'Circuito interrompido');
});
test('telemetria confirma falha e recuperação após persistência JSON e intervalo mínimo',async t=>{
 const [s,f]=setup(t);f.rpcFailure=true;await run();assert.equal(s.telemetry.failedCycles,1);const afterFailure=JSON.stringify(s.telemetry);
 await run();assert.equal(JSON.stringify(s.telemetry),afterFailure);globalThis.labState=JSON.parse(JSON.stringify(s));f.rpcFailure=false;f.now+=3600001;f.market.time=f.now;await run();assert.equal(labState.telemetry.failedCycles,1);assert.equal(labState.telemetry.completedCycles,1);assert.equal(labState.telemetry.consecutiveFailures,0);
});
test('pausa, intervalo e retenção impedem fontes e não criam telemetria fictícia',async t=>{
 const [s,f]=setup(t);s.paused=true;await run();assert.equal(s.telemetry,undefined);s.paused=false;s.lastRun=f.now;await run();assert.equal(s.telemetry,undefined);
 s.lastRun=null;s.signals=Array.from({length:1500},()=>({side:'buy'}));await run();assert.equal(s.paused,true);assert.equal(s.telemetry,undefined);assert.equal(f.methods.length,0);
});
test('janela conserva todos os candidatos na fila e distingue backlog de lacuna',async t=>{
 const [s,f]=setup(t);f.signatures=[...Array.from({length:8},(_,i)=>'synthetic-'+i),'synthetic-cursor'];await run();const w=s.wallets[0];assert.equal(s.signals.length,4);assert.equal(w.collectionWindow.limit,128);assert.equal(w.collectionWindow.queued,8);assert.equal(w.collectionWindow.omittedFromBatch,0);assert.equal(w.collectionWindow.windowMayBeTruncated,false);assert.equal(w.collectionWindow.cursorFound,true);assert.equal(w.gap,false);assert.equal(w.pending.signatures.length,4);assert.equal(w.pending.through,'synthetic-0');
});
test('primeiro lote fica histórico; não cria operações virtuais mesmo com swaps válidos',async t=>{
 const [s,f]=setup(t);s.wallets[0].cursor=null;f.signatures=['synthetic-first'];await run();assert.equal(s.signals[0].audit.historical,true);assert.equal(s.signals[0].audit.decisions[0].code,'historical_sample');assert(s.portfolios.every(p=>p.trades.length===0));assert.equal(f.quotes,0);
});
test('a consistência usa apenas saídas virtuais anteriores à deteção',async t=>{
 const [s,f]=setup(t);s.portfolios[0].trades=Array.from({length:20},(_,i)=>({wallet,pnl:1,side:'sell',time:f.now+1000,signature:'synthetic-future-'+i}));await run();const d=s.signals[0].audit.decisions.find(x=>x.strategy==='consistent');assert.equal(d.code,'consistency_not_proven');assert.equal(d.details.priorClosedTrades,0);assert.equal(s.portfolios[1].trades.length,0);
});
test('falha de mercado permite recolha real e regista simulação indisponível',async t=>{
 const [s,f]=setup(t);f.marketFailure=true;await run();assert.equal(s.signals.length,1);assert.equal(s.signals[0].audit.decisions[0].code,'market_unavailable');assert(s.portfolios.every(p=>p.trades.length===0));assert.equal(s.telemetry.lastCycle.outcome,'market_blocked');assert.equal(s.telemetry.marketBlockedCycles,1);assert.equal(s.telemetry.consecutiveMarketBlocks,1);
});
