import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTx,candidateSignals,candidateReasons,JUP,DFLOW} from '../lib/core.ts';
import {syntheticDflowSwap,syntheticTipDestination} from './helpers/synthetic-swaps.mjs';

const wallet='11111111111111111111111111111111';
test('DFlow reconhece ambos os discriminadores e gorjeta Jito separada dos saldos SPL',()=>{
 for(const variant of [0,1])for(const side of ['buy','sell']){
  const tx=syntheticDflowSwap(wallet,side,variant),signal=parseTx(tx,wallet,'synthetic');
  assert.equal(signal.side,side);assert.equal(signal.originalPrice,100);assert.match(signal.reason,/DFlow/);
  assert.deepEqual(candidateSignals(tx,'synthetic').map(x=>x.wallet),[wallet]);
 }
});
test('DFlow exige autoridade, discriminador e carteira signatária corretos',()=>{
 for(const mutate of [tx=>{tx.transaction.message.instructions[0].accounts[3]=JUP;},tx=>{tx.transaction.message.instructions[0].data='11111111';},tx=>{tx.transaction.message.accountKeys[0].signer=false;}]){
  const tx=syntheticDflowSwap(wallet);mutate(tx);assert.equal(parseTx(tx,wallet,'synthetic').side,'ignore');assert.deepEqual(candidateSignals(tx,'synthetic'),[]);
 }
});
test('fluxos SOL desconhecidos ou recebidos continuam ambíguos em DFlow e Jupiter',()=>{
 for(const program of [DFLOW,JUP])for(const incoming of [false,true]){
  const tx=syntheticDflowSwap(wallet);tx.transaction.message.instructions[0].programId=program;
  tx.transaction.message.instructions[1].parsed.info=incoming?{source:syntheticTipDestination,destination:wallet,lamports:1000}:{source:wallet,destination:JUP,lamports:1000};
  assert.equal(parseTx(tx,wallet,'synthetic').side,'ignore');assert.deepEqual(candidateReasons(tx,'synthetic'),['Fluxos SOL adicionais: operação ambígua']);
 }
});
test('gorjeta conhecida não cria swap sem alteração de SOL ou com conta token nova',()=>{
 const tx=syntheticDflowSwap(wallet);tx.meta.postTokenBalances[0]=structuredClone(tx.meta.preTokenBalances[0]);assert.equal(parseTx(tx,wallet,'synthetic').side,'ignore');
 const created=syntheticDflowSwap(wallet);created.meta.preTokenBalances.pop();assert.equal(parseTx(created,wallet,'synthetic').side,'ignore');
});
