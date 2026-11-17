import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,initPortfolios,archiveRecent,observationTotals,executionBlocked,strategyStatus,periods} from '../lib/core.ts';

function history(){
 const s=initial();initPortfolios(s);
 s.signals=Array.from({length:700},(_,i)=>({signature:'s'+i,wallet:'w',time:i,detected:i,side:'ignore',reason:i%2?'Sem saldo':'Sem swap',originalPrice:null}));
 s.signals.push({signature:'swap',wallet:'w',time:701,detected:701,side:'buy',reason:'Confirmado',originalPrice:100});
 s.wallets=[{address:'w',added:0,cursor:'cursor',status:'Em observação',swaps:1,observed:701,gap:true,pending:{signatures:['s0'],historical:true}}];
 s.logs=Array.from({length:1800},(_,i)=>({time:i,message:'Decisão '+i}));
 for(const p of s.portfolios){p.series=Array.from({length:900},(_,i)=>({time:i,equity:100-i/1000}));p.halted=true;p.losses.w=2;}
 return s;
}
const withoutSeries=portfolio=>Object.fromEntries(Object.entries(portfolio).filter(([key])=>key!=='series'));

test('arquivo preserva contagens, motivos, cursores, pendentes e todo o estado financeiro',()=>{
 const s=history(),before=structuredClone(s),totals=observationTotals(s),chunks=archiveRecent(s,1234);
 assert(chunks.length);assert.equal(s.signals.find(x=>x.signature==='s0')?.side,'ignore');
 assert(s.signals.some(x=>x.signature==='swap'));assert.deepEqual(s.wallets,before.wallets);
 assert.deepEqual(observationTotals(s),totals);
 assert.deepEqual(s.portfolios.map(withoutSeries),before.portfolios.map(withoutSeries));
 for(const p of s.portfolios){const old=chunks.filter(x=>x.kind==='series'&&x.portfolio===p.id).flatMap(x=>x.items);assert.deepEqual([...old,...p.series],before.portfolios.find(x=>x.id===p.id).series);}
 const ignored=chunks.filter(x=>x.kind==='signals').flatMap(x=>x.items);
 assert.equal(new Set([...ignored,...s.signals].map(x=>x.signature)).size,before.signals.length);
 assert.deepEqual(archiveRecent(s),[]);assert.equal(s.archive.last,1234);
});

test('arquivo de ciclos sucessivos mantém totais cumulativos após serialização',()=>{
 let s=history();archiveRecent(s);s=JSON.parse(JSON.stringify(s));
 for(let i=0;i<600;i++)s.signals.push({signature:'new'+i,wallet:'w',detected:1000+i,time:1000+i,side:'ignore',reason:'Sem saldo',originalPrice:null});
 const totals=observationTotals(s);archiveRecent(s);assert.deepEqual(observationTotals(s),totals);assert(s.archive.bytes>0);
});

test('arquivo mantém auditoria, telemetria, blocos de preço e marcador through',()=>{
 const s=history();s.signals[1].audit={version:1,historical:true,parser:{code:'parser_no_balance_change',slot:7,transactionVersion:1,signer:true,preAccounts:2,postAccounts:2,invalidBalances:0},decisions:[]};
 s.market={sol:100,eurPerUsd:1,usdcUsd:1,time:1000,fxDate:'2026-11-06',sourceBlocks:{sol:7,usdc:8}};s.telemetry={since:1,completedCycles:1};s.wallets[0].pending.through='newest';
 const before=structuredClone(s),chunks=archiveRecent(s),archived=chunks.filter(chunk=>chunk.kind==='signals').flatMap(chunk=>chunk.items);
 assert.deepEqual(archived.find(signal=>signal.signature==='s1').audit,before.signals[1].audit);assert.deepEqual(s.market,before.market);assert.deepEqual(s.telemetry,before.telemetry);assert.deepEqual(s.wallets,before.wallets);
});

test('limite de idade e preço é aplicado exatamente antes da operação',()=>{
 const s=initial(),now=2000000,signal={time:now-s.config.maxAge*1000};s.market={sol:100,eurPerUsd:.9,usdcUsd:1,fxDate:'2026-11-06',time:now};
 assert.equal(executionBlocked(s,signal,now),null);assert.equal(executionBlocked(s,signal,now+1),'signal_too_old');
 signal.time=now;s.market.time=now-180001;assert.equal(executionBlocked(s,signal,now),'market_stale');
 s.market.time=now+1;assert.equal(executionBlocked(s,signal,now),'market_unavailable');
});

test('estado de estratégia revela os bloqueios efetivos e não altera o portfolio',()=>{
 const s=initial();initPortfolios(s);s.wallets=[{address:'w'}];s.market={sol:100,eurPerUsd:1,usdcUsd:1,time:Date.now(),fxDate:'2026-11-06'};
 const before=structuredClone(s.portfolios);assert.equal(strategyStatus(s,s.portfolios[1]),'A aguardar amostra consistente');
 s.portfolios[2].losses.w=2;assert.match(strategyStatus(s,s.portfolios[2]),/duas perdas/);
 assert.deepEqual(s.portfolios[0],before[0]);Object.assign(s.portfolios[0],periods(Date.now()));s.portfolios[0].cash=97;assert.match(strategyStatus(s,s.portfolios[0]),/diária/);
});
