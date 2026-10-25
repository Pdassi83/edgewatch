import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {initial} from '../lib/core.ts';
const encode=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64');
const core=encode(fs.readFileSync('lib/core.ts','utf8'));
const source=fs.readFileSync('lib/runner.ts','utf8').replace("import {Providers} from './providers';","class Providers { constructor(s){this.s=s} async rpc(){globalThis.rpcCalls++;throw Error('HTTP 429 fixture');} }").replace("import {mutate,readState} from './store';","const mutate=async fn=>fn(globalThis.testState);const readState=async()=>globalThis.testState;").replace("from './core'",`from '${core}'`);
const {run}=await import(encode(source));
test('tarefa agendada respeita pausa sem chamar fontes',async()=>{globalThis.testState={...initial(),paused:true};globalThis.rpcCalls=0;await run();assert.equal(globalThis.rpcCalls,0);assert.equal(globalThis.testState.lastRun,null)});
test('execução repetida antes do intervalo não duplica recolha',async()=>{globalThis.testState={...initial(),lastRun:Date.now()};globalThis.rpcCalls=0;await run();assert.equal(globalThis.rpcCalls,0)});
test('falha de API fica registada no estado persistível e não cria trades',async()=>{globalThis.testState=initial();globalThis.rpcCalls=0;await run();assert.equal(globalThis.testState.status,'Circuito interrompido');assert.equal(globalThis.testState.logs.length,1);assert.equal(globalThis.testState.portfolios.length,0);assert.equal(globalThis.rpcCalls,1)});
