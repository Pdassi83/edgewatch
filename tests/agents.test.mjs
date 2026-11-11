import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial} from '../lib/core.ts';
import {core,encode} from './helpers/modules.mjs';
const source=fs.readFileSync('lib/agents.ts','utf8').replace("from './core'",`from '${core}'`);
const {observationAt,reflexBaseline,brainBaseline}=await import(encode(source));
const NOW=1_800_000_000_000,wallet='11111111111111111111111111111111';

function fixture(){const s=initial();s.lastSuccess=NOW-1000;s.market={sol:100,eurPerUsd:.9,usdcUsd:1,fxDate:'2027-01-15',time:NOW-1000};s.wallets=[{address:wallet,added:NOW-1,cursor:null,status:'ok',observed:1,swaps:1,gap:false}];s.signals=[{signature:'past',wallet,time:NOW-2000,detected:NOW-1500,side:'buy',reason:'supported',originalPrice:100}];return s;}

test('observação causal exclui sinais e preços futuros sem mutar estado',()=>{const s=fixture();s.signals.push({signature:'future',wallet,time:NOW+1,detected:NOW+1,side:'sell',reason:'future',originalPrice:100});const before=JSON.stringify(s),o=observationAt(s,NOW);assert.equal(o.latestSignal.signature,'past');assert.equal(o.market.solEur,90);assert.equal(JSON.stringify(s),before);});
test('REFLEX permanece proposta observacional e escolhe HOLD perante dados inseguros',()=>{const s=fixture();s.market.time=NOW-180001;s.wallets[0].gap=true;const p=reflexBaseline(observationAt(s,NOW));assert.equal(p.mode,'observe_only');assert.equal(p.action,'HOLD');assert.equal(p.confidence,0);assert(p.reasonCodes.includes('market_not_fresh'));assert(p.reasonCodes.includes('coverage_gaps'));});
test('baseline saudável apenas espelha sinal suportado com confiança neutra',()=>{const p=reflexBaseline(observationAt(fixture(),NOW));assert.deepEqual({action:p.action,confidence:p.confidence,mode:p.mode},{action:'BUY',confidence:.5,mode:'observe_only'});});
test('BRAIN produz hipóteses auditáveis sem alterar estratégias',()=>{const s=fixture();s.wallets[0].pending={signatures:['a','b'],historical:false};const before=JSON.stringify(s),r=brainBaseline(observationAt(s,NOW));assert.equal(r.mode,'observe_only');assert(r.findings.some(x=>x.code==='pending_transactions'&&x.evidence===2));assert(r.hypotheses.length>0);assert.equal(JSON.stringify(s),before);});
