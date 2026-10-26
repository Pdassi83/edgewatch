import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {initial} from '../lib/core.ts';
const encode=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64');
const core=encode(fs.readFileSync('lib/core.ts','utf8'));
const source=fs.readFileSync('lib/runner.ts','utf8').replace("import {Providers} from './providers';","class Providers { constructor(s){this.s=s} async rpc(){globalThis.rpcCalls++;throw Error('HTTP 429 fixture');} }").replace("import {mutate,readState} from './store';","const mutate=async fn=>fn(globalThis.testState);const readState=async()=>globalThis.testState;").replace("from './core'",`from '${core}'`);
const {run}=await import(encode(source));
test('tarefa agendada respeita pausa sem chamar fontes',async()=>{globalThis.testState={...initial(),paused:true};globalThis.rpcCalls=0;await run();assert.equal(globalThis.rpcCalls,0);assert.equal(globalThis.testState.lastRun,null)});
test('execução repetida antes do intervalo não duplica recolha',async()=>{globalThis.testState={...initial(),lastRun:Date.now()};globalThis.rpcCalls=0;await run();assert.equal(globalThis.rpcCalls,0)});
test('falha de API fica registada no estado persistível e não cria trades',async()=>{globalThis.testState=initial();globalThis.rpcCalls=0;await run();assert.equal(globalThis.testState.status,'Circuito interrompido');assert.equal(globalThis.testState.logs.length,1);assert.equal(globalThis.testState.portfolios.length,0);assert.equal(globalThis.rpcCalls,1)});
test('falha não permite antecipar o intervalo configurado',async()=>{globalThis.testState={...initial(),status:'Circuito interrompido',lastRun:Date.now()-120000};globalThis.rpcCalls=0;await run();assert.equal(globalThis.rpcCalls,0)});
const resumeSource=fs.readFileSync('lib/runner.ts','utf8').replace("import {Providers} from './providers';",`class Providers {
 calls=0;constructor(s){this.s=s}
 async rpc(method,params){globalThis.methods.push([method,params]);if(method==='getSlot')return 1;if(method==='getSignaturesForAddress')return ['d','c','b','a'].map(signature=>({signature}));
 if(params[0]==='b'&&globalThis.failBatch)throw Error('HTTP 429 fixture');return {blockTime:Math.floor(Date.now()/1000)};}
 async market(){throw Error('fixture market unavailable')}
}`).replace("import {mutate,readState} from './store';","const mutate=async fn=>fn(globalThis.batchState);const readState=async()=>globalThis.batchState;").replace("from './core'",`from '${core}'`);
const {run:resumeRun}=await import(encode(resumeSource));
test('retoma lote persistido após falha sem duplicados nem executar histórico',async()=>{
 globalThis.batchState=initial();globalThis.batchState.wallets=[{address:'wallet',cursor:null,added:0,status:'Em observação',observed:0,swaps:0,gap:false}];globalThis.methods=[];globalThis.failBatch=true;
 await resumeRun();assert.equal(batchState.signals.length,1);assert.equal(batchState.wallets[0].cursor,'a');assert.deepEqual(batchState.wallets[0].pending,{signatures:['b','c','d'],historical:true});
 globalThis.batchState=JSON.parse(JSON.stringify(batchState));batchState.lastRun=Date.now()-3600001;globalThis.failBatch=false;globalThis.methods=[];
 await resumeRun();assert.equal(batchState.signals.length,4);assert.equal(batchState.wallets[0].observed,4);assert.equal(batchState.wallets[0].cursor,'d');assert.equal(batchState.wallets[0].pending,undefined);
 assert(!methods.some(([method])=>method==='getSignaturesForAddress'));assert.deepEqual(methods.filter(([method])=>method==='getTransaction').map(([,params])=>params[0]),['b','c','d']);
 assert.equal(batchState.logs.filter(x=>x.message.includes('amostra histórica')).length,4);assert.equal(batchState.portfolios.length,0);
});
