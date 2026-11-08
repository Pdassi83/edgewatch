import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial} from '../lib/core.ts';
import {core,encode} from './helpers/modules.mjs';
const agents=encode(fs.readFileSync('lib/agents.ts','utf8').replace("from './core'",`from '${core}'`));
const ledgerModule=encode(fs.readFileSync('lib/research-ledger.ts','utf8').replace("from './agents'",`from '${agents}'`));
const {observationAt,reflexBaseline}=await import(agents),{decisionRecord,researchLedger}=await import(ledgerModule);
const T=1_800_000_000_000,wallet='11111111111111111111111111111111';
function input(){const s=initial();s.lastSuccess=T-1000;s.market={sol:100,eurPerUsd:.9,usdcUsd:1,fxDate:'2027-01-15',time:T-1000};s.wallets=[{address:wallet,added:T-10,cursor:null,status:'ok',observed:1,swaps:1,gap:false}];s.signals=[{signature:'signal',wallet,time:T-2000,detected:T-1500,side:'buy',reason:'supported',originalPrice:100}];const observation=observationAt(s,T);return {observation,proposal:reflexBaseline(observation)};}

test('registo versionado conserva apenas decisão observacional e cotação virtual',()=>{const x=input(),q={requestedAt:T+1,receivedAt:T+2,priceEur:90,estimatedCostEur:.1,source:'synthetic'},r=decisionRecord(x.observation,x.proposal,q,T+3);assert.equal(r.schemaVersion,1);assert.equal(r.tradingMode,'paper_only');assert.equal(r.provenance.execution,'not_executed');assert.equal(r.provenance.credentialsIncluded,false);});
test('cotação anterior à decisão ou recebida depois do registo é rejeitada',()=>{const x=input();assert.throws(()=>decisionRecord(x.observation,x.proposal,{requestedAt:T-1,receivedAt:T,priceEur:90,estimatedCostEur:0,source:'synthetic'},T+2),/Cronologia/);assert.throws(()=>decisionRecord(x.observation,x.proposal,{requestedAt:T+1,receivedAt:T+3,priceEur:90,estimatedCostEur:0,source:'synthetic'},T+2),/Cronologia/);});
test('HOLD nunca recebe cotação de execução',()=>{const x=input();x.proposal={...x.proposal,action:'HOLD',confidence:0};assert.throws(()=>decisionRecord(x.observation,x.proposal,{requestedAt:T+1,receivedAt:T+2,priceEur:90,estimatedCostEur:0,source:'synthetic'},T+3),/HOLD/);});
test('ledger ordena decisões e recusa duplicados',()=>{const x=input(),a=decisionRecord(x.observation,x.proposal,null,T+1),later=structuredClone(a);later.observation.asOf=T+10;later.observation.market.ageMs+=10;later.proposal.asOf=T+10;later.recordedAt=T+11;assert.deepEqual(researchLedger([later,a]).records.map(r=>r.observation.asOf),[T,T+10]);assert.throws(()=>researchLedger([a,a]),/duplicada/);});
test('proposta desalinhada nunca é guardada',()=>{const x=input();assert.throws(()=>decisionRecord(x.observation,{...x.proposal,asOf:T+1}),/desalinhadas/);assert.throws(()=>decisionRecord(x.observation,{...x.proposal,signalSignature:'outro'}),/não corresponde/);});
test('registos importados voltam a validar causalidade, proveniência e origem',()=>{const x=input(),r=decisionRecord(x.observation,x.proposal,null,T+1),future=structuredClone(r);future.observation.latestSignal.time=T;future.observation.latestSignal.detected=T-1;assert.throws(()=>researchLedger([future]),/Sinal futuro/);const provenance=structuredClone(r);provenance.provenance.credentialsIncluded=true;assert.throws(()=>researchLedger([provenance]),/incompatível/);});
test('ação desconhecida nunca entra no ledger',()=>{const x=input();assert.throws(()=>decisionRecord(x.observation,{...x.proposal,action:'TRANSFER'}),/Proposta incompatível/);});
