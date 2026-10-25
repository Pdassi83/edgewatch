import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,initPortfolios,parseTx,SOL,USDC,JUP,buy,sell,equity,risk,sampleStats,validAddress,validateConfig,periods} from '../lib/core.ts';
const wallet='11111111111111111111111111111111';
const balance=(mint,amount,i)=>({mint,owner:wallet,accountIndex:i,uiTokenAmount:{amount:String(amount),decimals:6}});
function tx(){return {blockTime:1700000000,transaction:{message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:[{programId:JUP}]}},meta:{err:null,preTokenBalances:[balance(SOL,1000000,0),balance(USDC,200000000,1)],postTokenBalances:[balance(SOL,2000000,0),balance(USDC,100000000,1)],innerInstructions:[]}};}
function setup(){const s=initial();initPortfolios(s);return [s,s.portfolios[0]];}
const signal={signature:'test-only',wallet,time:1,detected:2,side:'buy',reason:'fixture',originalPrice:100};
test('interpreta compra Jupiter por saldos SPL e preço original',()=>{const r=parseTx(tx(),wallet,'sig',1700000001000);assert.equal(r.side,'buy');assert.equal(r.originalPrice,100);assert.equal(r.time,1700000000000)});
test('interpreta venda',()=>{const t=tx();[t.meta.preTokenBalances,t.meta.postTokenBalances]=[t.meta.postTokenBalances,t.meta.preTokenBalances];assert.equal(parseTx(t,wallet,'s').side,'sell')});
test('transferência sem Jupiter não é compra',()=>{const t=tx();t.transaction.message.instructions=[];assert.equal(parseTx(t,wallet,'s').side,'ignore')});
test('transação falhada nunca produz sinal',()=>{const t=tx();t.meta.err={x:1};assert.equal(parseTx(t,wallet,'s').side,'ignore')});
test('rejeita conta de token recém-criada e renda ambígua',()=>{const t=tx();t.meta.preTokenBalances.pop();assert.equal(parseTx(t,wallet,'s').side,'ignore')});
test('não copia carteira que não assina',()=>{const t=tx();t.transaction.message.accountKeys[0].signer=false;assert.equal(parseTx(t,wallet,'s').side,'ignore')});
test('rejeita terceiro ativo',()=>{const t=tx();t.meta.preTokenBalances.push(balance('other',100,2));t.meta.postTokenBalances.push(balance('other',200,2));assert.equal(parseTx(t,wallet,'s').side,'ignore')});
test('contabilidade inclui custo de entrada e saída sem criar dinheiro',()=>{const [s,p]=setup();assert(buy(p,s.config,signal,.09,9,.1,100,{},3));assert.equal(p.cash,90.9);assert.equal(equity(p,100),99.9);assert(sell(p,{...signal,signature:'sale'},10,.1,{},4,50));assert(Math.abs(p.cash-100.8)<1e-9);assert(Math.abs(p.trades[1].pnl-.8)<1e-9);assert.equal(p.positions.length,0)});
test('duplicados não alteram capital',()=>{const [s,p]=setup();buy(p,s.config,signal,.09,9,.1,100,{},3);assert.equal(buy(p,s.config,signal,.09,9,.1,100,{},3),false);assert.equal(p.trades.length,1)});
test('limites de operação e NaN',()=>{const [s,p]=setup();assert.equal(buy(p,s.config,signal,1,100,0,100,{},3),false);assert.equal(buy(p,s.config,signal,NaN,9,0,100,{},3),false)});
test('limite por trader impede acumulação',()=>{const [s,p]=setup();buy(p,s.config,signal,.09,9,0,100,{},3);buy(p,s.config,{...signal,signature:'b'},.09,9,0,100,{},4);assert.equal(buy(p,s.config,{...signal,signature:'c'},.09,9,0,100,{},5),false)});
test('drawdown permanece suspenso após recuperação',()=>{const [s,p]=setup();p.cash=89;assert.match(risk(p,s.config,100,Date.now()),/drawdown/);p.cash=100;assert.match(risk(p,s.config,100,Date.now()),/drawdown/)});
test('perda diária usa saldo marcado anterior',()=>{const [s,p]=setup();risk(p,s.config,100,Date.now());p.cash=97;assert.match(risk(p,s.config,100,Date.now()),/diária/)});
test('duas perdas acumulam e lucro reinicia contagem',()=>{const [s,p]=setup();for(let i=0;i<2;i++){buy(p,s.config,{...signal,signature:'b'+i},.05,5,0,100,{},3);sell(p,{...signal,signature:'s'+i},4,0,{},4,50)}assert.equal(p.losses[wallet],2);buy(p,s.config,{...signal,signature:'profitbuy'},.05,5,0,100,{},5);sell(p,{...signal,signature:'profitsell'},6,0,{},6,50);assert.equal(p.losses[wallet],0)});
test('métricas indisponíveis sem amostra',()=>{assert.equal(sampleStats([]).score,null);assert.equal(sampleStats([]).winRate,null)});
test('Wilson penaliza amostras pequenas',()=>{assert.equal(sampleStats(Array.from({length:19},()=>({pnl:1}))).score,null);assert(sampleStats(Array.from({length:20},()=>({pnl:1}))).score<100)});
test('valida endereço real e rejeita base58 inválido',()=>{assert(validAddress(SOL));assert(validAddress(JUP));assert(!validAddress('0'.repeat(44)));assert(!validAddress('a'.repeat(32)))});
test('configuração não ultrapassa limites de proteção',()=>{assert.throws(()=>validateConfig({...initial().config,drawdown:99}));assert.deepEqual(validateConfig(initial().config),initial().config)});
test('semana UTC começa na segunda-feira',()=>{assert.equal(periods(Date.parse('2026-10-25T23:59:00Z')).week,'2026-10-19')});
