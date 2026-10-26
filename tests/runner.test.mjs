import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {initial,initPortfolios,SOL,USDC,JUP,candidateSignals,ignoredReasons} from '../lib/core.ts';
const encode=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(s,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64');
const core=encode(fs.readFileSync('lib/core.ts','utf8'));
const source=fs.readFileSync('lib/runner.ts','utf8').replace("import {Providers} from './providers';","class Providers { constructor(s){this.s=s} async rpc(){globalThis.rpcCalls++;throw Error('HTTP 429 fixture');} }").replace("import {mutate,readState} from './store';","const mutate=async fn=>fn(globalThis.testState);const readState=async()=>globalThis.testState;").replace("from './core'",`from '${core}'`);
const {run,discover}=await import(encode(source));
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
 globalThis.batchState=initial();globalThis.batchState.config.maxTraders=1;globalThis.batchState.wallets=[{address:'wallet',cursor:null,added:0,status:'Em observação',observed:0,swaps:0,gap:false}];globalThis.methods=[];globalThis.failBatch=true;
 await resumeRun();assert.equal(batchState.signals.length,1);assert.equal(batchState.wallets[0].cursor,'a');assert.deepEqual(batchState.wallets[0].pending,{signatures:['b','c','d'],historical:true});
 globalThis.batchState=JSON.parse(JSON.stringify(batchState));batchState.lastRun=Date.now()-3600001;globalThis.failBatch=false;globalThis.methods=[];
 await resumeRun();assert.equal(batchState.signals.length,4);assert.equal(batchState.wallets[0].observed,4);assert.equal(batchState.wallets[0].cursor,'d');assert.equal(batchState.wallets[0].pending,undefined);
 assert(!methods.some(([method])=>method==='getSignaturesForAddress'));assert.deepEqual(methods.filter(([method])=>method==='getTransaction').map(([,params])=>params[0]),['b','c','d']);
 assert.equal(batchState.logs.filter(x=>x.message.includes('amostra histórica')).length,4);assert.equal(batchState.portfolios.length,0);
});
const wallets=['11111111111111111111111111111111',SOL,USDC];
function swap(address,side='buy'){
 const balance=(mint,amount,index)=>({mint,owner:address,accountIndex:index,uiTokenAmount:{amount:String(amount),decimals:6}});
 const pre=[balance(SOL,1000000,0),balance(USDC,200000000,1)],post=[balance(SOL,2000000,0),balance(USDC,100000000,1)];
 return {version:1,blockTime:Math.floor(Date.now()/1000),transaction:{message:{transactionConfig:{computeUnitLimit:200000,priorityFee:50000},accountKeys:[{pubkey:JUP,signer:true},{pubkey:address,signer:true}],instructions:[{programId:JUP}]}},meta:{err:null,preTokenBalances:side==='buy'?pre:post,postTokenBalances:side==='buy'?post:pre,innerInstructions:[]}};
}
test('descoberta identifica dono do swap e rejeita pagador sem saldos',()=>{
 const signals=candidateSignals(swap(wallets[0]),'proof');assert.deepEqual(signals.map(x=>x.wallet),[wallets[0]]);
});
test('preenche vagas até ao limite, sem duplicar carteiras ou simular evidência histórica',async()=>{
 const s=initial();s.wallets=[{address:wallets[0],added:0,cursor:'old',observed:0,swaps:0,gap:false,status:'Em observação'}];let calls=0;
 const api={calls:0,async rpc(method,params){calls++;if(method==='getSignaturesForAddress')return wallets.map((_,i)=>({signature:String(i)}));return swap(wallets[Number(params[0])]);}};
 await discover(s,api);assert.equal(s.wallets.length,3);assert.equal(s.signals.length,2);assert(s.wallets.slice(1).every(w=>w.validatedAt&&w.swaps===1));assert.equal(s.portfolios.length,0);
 await discover(s,api);assert.equal(calls,4);assert.equal(s.wallets.length,3);
});
test('rejeita amostra incompatível sem inventar candidatos e não volta a pedir a mesma transação',async()=>{
 const s=initial();let fetched=0;const api={calls:0,async rpc(method){if(method==='getSignaturesForAddress')return [{signature:'bad'}];fetched++;return {meta:{err:null},transaction:{message:{accountKeys:[{pubkey:wallets[0],signer:true}],instructions:[]}}};}};
 await discover(s,api);await discover(s,api);assert.equal(s.wallets.length,0);assert.equal(s.discovery.rejected,1);assert.equal(fetched,1);assert.equal(s.signals.length,0);
});
test('falha de descoberta não marca transação como analisada e retoma na próxima recolha',async()=>{
 const s=initial();let fail=true;const api={calls:0,async rpc(method){if(method==='getSignaturesForAddress')return [{signature:'pending'}];if(fail)throw Error('429');return swap(wallets[0]);}};
 await assert.rejects(discover(s,api),/429/);assert.deepEqual(s.discovery.seen,[]);fail=false;await discover(s,api);assert.equal(s.wallets.length,1);assert.equal(s.discovery.scanned,1);
});
test('descoberta respeita orçamento restante e agrega motivos de rejeição',async()=>{
 const s=initial();await discover(s,{calls:27,rpc(){throw Error('unexpected')}});assert.equal(s.discovery,undefined);
 assert.deepEqual(ignoredReasons([{side:'ignore',reason:'Sem saldo'},{side:'ignore',reason:'Sem saldo'},{side:'buy',reason:'OK'}]),[['Sem saldo',2]]);
});
const simulationSource=fs.readFileSync('lib/runner.ts','utf8').replace("import {Providers} from './providers';",`class Providers {
 calls=0;constructor(s){this.s=s}
 async rpc(method,params){if(method==='getSlot')return 1;if(method==='getSignaturesForAddress')return [{signature:globalThis.simSide}, {signature:this.s.wallets[0].cursor}];if(params[1]?.maxSupportedTransactionVersion!==1)throw Error('RPC -32015 fixture');return globalThis.swapFixture(this.s.wallets[0].address,globalThis.simSide)}
 async market(){return {sol:100,usdcUsd:1,eurPerUsd:1,time:Date.now(),fxDate:'2026-10-26'}}
 async feeSol(){return .00005}
 async quote(input,output,amount){return {outAmount:input==='${USDC}'?String(Math.floor(Number(amount)*10)):String(Math.floor(Number(amount)/10))}}
}`).replace("import {mutate,readState} from './store';","const mutate=async fn=>fn(globalThis.simState);const readState=async()=>globalThis.simState;").replace("from './core'",`from '${core}'`);
const {run:simulateRun}=await import(encode(simulationSource));
test('sinal reconhecido posterior à descoberta abre e fecha posições apenas virtuais',async()=>{
 globalThis.simState=initial();simState.config.maxTraders=1;simState.wallets=[{address:wallets[0],added:Date.now()-3600000,cursor:'discovery',observed:1,swaps:1,gap:true,status:'Em observação'}];globalThis.swapFixture=swap;globalThis.simSide='buy';
 await simulateRun();assert.equal(simState.portfolios[0].trades.length,1);assert.equal(simState.portfolios[0].trades[0].side,'buy');assert.equal(simState.portfolios[1].trades.length,0);assert.equal(simState.portfolios[2].trades.length,1);
 simState.lastRun=Date.now()-3600001;globalThis.simSide='sell';await simulateRun();assert.equal(simState.portfolios[0].trades.length,2);assert.equal(simState.portfolios[0].positions.length,0);assert(simState.portfolios[0].trades[1].pnl<0);assert.equal(simState.portfolios[1].trades.length,0);
});

test('descoberta lê v1 e preserva evidência histórica sem criar ordens',async()=>{
 const s=initial();const api={calls:0,async rpc(method,params){
  if(method==='getSignaturesForAddress')return [{signature:'v1-proof'}];
  if(params[1]?.maxSupportedTransactionVersion!==1)throw Error('RPC -32015 fixture');
  assert.equal(params[1].encoding,'jsonParsed');return swap(wallets[0]);
 }};
 await discover(s,api);assert.equal(s.wallets.length,1);assert.equal(s.signals[0].side,'buy');assert.equal(s.portfolios.length,0);
});
