import test from 'node:test';
import assert from 'node:assert/strict';
import {scoutWallets,SCOUT_POLICY,SCOUT_LABELS} from '../lib/scout.ts';

const NOW=1800000000000;
const wallet=(address,observed,swaps,extra={})=>({
 address,added:NOW-100000,cursor:null,status:'Em observação',observed,swaps,gap:false,...extra,
});
const sample=(wallets)=>({wallets,lastRun:NOW-10000,lastSuccess:NOW-9000});

test('identifica a carteira incompatível sem a eliminar ou atribuir P/L',()=>{
 const state=sample([wallet('synthetic-incompatible',1185,0,{gap:true,pending:{count:84,historical:false}})]);
 const copy=structuredClone(state),r=scoutWallets(state,NOW),w=r.wallets[0];
 assert.equal(w.status,'investigate_compatibility');
 assert.equal(w.parserCompatibilityRate,0);
 assert.equal(w.pending,84);
 assert.equal(w.profitabilityEvidence,null);
 assert(w.reasons.includes('known_coverage_gap'));
 assert(w.reasons.includes('pending_backlog'));
 assert.equal(r.mode,'observe_only');
 assert.deepEqual(state,copy);
});

test('não classifica carteira com swaps compatíveis e lacunas como pronta para investigação',()=>{
 const r=scoutWallets(sample([wallet('synthetic-with-gaps',735,90,{gap:true,pending:{signatures:['a','b']}})]),NOW);
 assert.equal(r.wallets[0].status,'coverage_review');
 assert(r.wallets[0].parserCompatibilityRate>0.1);
 assert.equal(r.summary.byStatus.research_candidate,0);
});

test('amostra de duas observações não permite comparar rentabilidade',()=>{
 const r=scoutWallets(sample([wallet('synthetic-small',2,1,{gap:true})]),NOW);
 assert.equal(r.wallets[0].status,'insufficient_evidence');
 assert(r.wallets[0].reasons.includes('too_few_observations'));
});

test('só sinaliza candidato a investigação offline com evidência mínima e sem lacunas conhecidas',()=>{
 const r=scoutWallets(sample([wallet('synthetic-research',30,5)]),NOW);
 assert.equal(r.wallets[0].status,'research_candidate');
 assert(r.wallets[0].reasons.includes('meets_compatibility_screen'));
 assert.equal(r.wallets[0].profitabilityEvidence,null);
 assert.equal(SCOUT_POLICY.minimumObserved,30);
 assert(SCOUT_LABELS.research_candidate.includes('offline'));
});

test('fila acima do limite impede investigação mesmo com swaps suportados',()=>{
 const r=scoutWallets(sample([wallet('synthetic-pending',100,20,{pending:{count:11}})]),NOW);
 assert.equal(r.wallets[0].status,'coverage_review');
 assert.equal(r.wallets[0].pending,11);
});

test('não atribui confiança a contadores ou filas impossíveis',()=>{
 const r=scoutWallets(sample([
  wallet('synthetic-invalid',12,13),
  wallet('synthetic-bad-queue',100,15,{pending:{count:-1}}),
  wallet('synthetic-conflicting-queue',100,15,{pending:{count:2,signatures:['a']}}),
 ]),NOW);
 assert(r.wallets.every(w=>w.status==='invalid_evidence'));
 assert.equal(r.wallets[0].parserCompatibilityRate,null);
 assert.equal(r.wallets[1].pending,null);
});

test('totais agregados posteriores ao instante de avaliação são inválidos; não há replay com fuga temporal',()=>{
 const state=sample([wallet('synthetic-time',100,10)]);
 state.lastSuccess=NOW+1;
 const r=scoutWallets(state,NOW);
 assert.equal(r.wallets[0].status,'invalid_evidence');
 assert(r.wallets[0].reasons.includes('future_aggregate'));
});

test('o resultado preserva a ordem e conta cada diagnóstico sem inventar rankings de lucro',()=>{
 const r=scoutWallets(sample([
  wallet('synthetic-one',100,0),
  wallet('synthetic-two',5,2),
  wallet('synthetic-three',40,8,{gap:true}),
  wallet('synthetic-four',50,9),
 ]),NOW);
 assert.deepEqual(r.wallets.map(w=>w.address),['synthetic-one','synthetic-two','synthetic-three','synthetic-four']);
 assert.deepEqual(r.summary.byStatus,{
  invalid_evidence:0,investigate_compatibility:1,insufficient_evidence:1,coverage_review:1,research_candidate:1,
 });
 assert(r.limitations.some(x=>x.includes('not profitability')));
});

test('instante de avaliação inválido é recusado',()=>{
 assert.throws(()=>scoutWallets(sample([]),NaN),/Instante/);
});
