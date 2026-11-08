import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial,initPortfolios} from '../lib/core.ts';
import {core,encode} from './helpers/modules.mjs';
const agents=encode(fs.readFileSync('lib/agents.ts','utf8').replace("from './core'",`from '${core}'`));
const evaluation=encode(fs.readFileSync('lib/evaluation.ts','utf8').replace("from './core'",`from '${core}'`).replace("from './agents'",`from '${agents}'`));
const {evaluateReflex,compareWithExistingStrategies}=await import(evaluation);
const T=1_800_000_000_000,wallet='11111111111111111111111111111111';
function frame(asOf,side='buy'){const s=initial();s.lastSuccess=asOf-1000;s.market={sol:100,eurPerUsd:.9,usdcUsd:1,fxDate:'2027-01-15',time:asOf-1000};s.wallets=[{address:wallet,added:asOf-10,cursor:null,status:'ok',observed:1,swaps:1,gap:false}];s.signals=[{signature:String(asOf),wallet,time:asOf-2000,detected:asOf-1500,side,reason:'supported',originalPrice:100}];return {asOf,state:s};}

test('replay ordena frames, não muta dados e conta propostas sem executar',()=>{const frames=[frame(T+10000,'sell'),frame(T,'buy')],before=JSON.stringify(frames),r=evaluateReflex(frames);assert.deepEqual(r.actions,{BUY:1,SELL:1,HOLD:0});assert.equal(r.actionable,2);assert.equal(r.mode,'offline_observation_only');assert.equal(JSON.stringify(frames),before);});
test('avaliação recusa inventar P/L sem preços de execução alinhados',()=>{const r=evaluateReflex([frame(T)]);assert.equal(r.pnlEur,null);assert.equal(r.pnlStatus,'unavailable_without_aligned_execution_prices');});
test('frames inseguros tornam-se HOLD e preservam motivos',()=>{const x=frame(T);x.state.market.time=T-180001;x.state.wallets[0].gap=true;const r=evaluateReflex([x]);assert.equal(r.actions.HOLD,1);assert.equal(r.blockedReasons.market_not_fresh,1);assert.equal(r.blockedReasons.coverage_gaps,1);});
test('comparação com estratégias é descritiva, não contrafactual',()=>{const x=frame(T),s=x.state;initPortfolios(s);s.portfolios[0].trades=[{id:'x',strategy:'simple',wallet,signature:'x',side:'sell',time:T,sourceTime:T-2,detected:T-1,qty:1,price:99,originalPrice:100,cost:1,slippage:50,pnl:-2,reason:'virtual',quote:null}];const c=compareWithExistingStrategies(s,evaluateReflex([x]));assert.equal(c.comparison,'descriptive_not_counterfactual');assert.equal(c.reflex.pnlEur,null);assert.equal(c.strategies[0].realizedPnlEur,-2);});
test('instantes duplicados são rejeitados para evitar dupla contagem',()=>{assert.throws(()=>evaluateReflex([frame(T),frame(T)]),/Frames duplicados/);});
