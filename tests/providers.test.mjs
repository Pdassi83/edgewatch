import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';
import {initial,SOL,USDC} from '../lib/core.ts';
const coreURL='data:text/javascript;base64,'+Buffer.from(ts.transpile(fs.readFileSync('lib/core.ts','utf8'),{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64');
const source=fs.readFileSync('lib/providers.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env={};").replace("from './core'",`from '${coreURL}'`);
const {Providers}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64'));
test('HTTP 429 fecha circuito sem repetir indefinidamente',async()=>{const old=global.fetch;global.fetch=async()=>new Response('',{status:429});try{await assert.rejects(new Providers(initial()).rpc('getSlot'),/429/)}finally{global.fetch=old}});
test('orçamento diário impede fetch',async()=>{const s=initial();s.callDay=new Date().toISOString().slice(0,10);s.calls=1500;await assert.rejects(new Providers(s).rpc('getSlot'),/diário/)});
test('quote inválida é rejeitada',async()=>{const old=global.fetch;global.fetch=async()=>Response.json({inputMint:USDC,outputMint:SOL,inAmount:'1000000',outAmount:'2000',priceImpactPct:'NaN',routePlan:[{}]});try{await assert.rejects(new Providers(initial()).quote(USDC,SOL,'1000000'),/Cotação/)}finally{global.fetch=old}});
test('quote válida não pede transação nem assinatura',async()=>{const old=global.fetch;global.fetch=async(url,opt)=>{assert(!url.includes('taker'));assert(!opt.method||opt.method==='GET');return Response.json({inputMint:USDC,outputMint:SOL,inAmount:'1000000',outAmount:'2000',priceImpactPct:'0.01',routePlan:[{}]})};try{const q=await new Providers(initial()).quote(USDC,SOL,'1000000');assert.equal(q.outAmount,'2000');assert(q.receivedAt<=Date.now())}finally{global.fetch=old}});
test('RPC JSON error não é aceite como resposta',async()=>{const old=global.fetch;global.fetch=async()=>Response.json({error:{code:-32600}});try{await assert.rejects(new Providers(initial()).rpc('getSlot'),/RPC recusou/)}finally{global.fetch=old}});
test('Retry-After persiste entre instâncias e não consome pedidos durante espera',async()=>{
 const old=global.fetch;let calls=0;const s=initial();
 global.fetch=async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'7200'}})};
 try{const before=Date.now();await assert.rejects(new Providers(s).rpc('getTransaction'),/publicnode.com · getTransaction.*429/);
 assert(s.providerLimits['solana-rpc.publicnode.com'].until>=before+7200000);
 const persisted=JSON.parse(JSON.stringify(s));await assert.rejects(new Providers(persisted).rpc('getSlot'),/em espera/);
 assert.equal(calls,1);assert.equal(persisted.calls,1);
 }finally{global.fetch=old}
});
test('Retry-After HTTP date e backoff exponencial sem repetir no ciclo',async()=>{
 const old=global.fetch,oldNow=Date.now;let now=1800000000000;Date.now=()=>now;const s=initial();let header=new Date(now+600000).toUTCString();
 global.fetch=async()=>new Response('',{status:429,headers:{'retry-after':header}});
 try{await assert.rejects(new Providers(s).rpc('getSlot'),/429/);assert.equal(s.providerLimits['solana-rpc.publicnode.com'].until,now+600000);
 now+=600001;header='inválido';await assert.rejects(new Providers(s).rpc('getSlot'),/429/);assert.equal(s.providerLimits['solana-rpc.publicnode.com'].until,now+120000);
 }finally{global.fetch=old;Date.now=oldNow}
});
test('pedidos ao mesmo host são espaçados e todos contam no orçamento',async()=>{
 const old=global.fetch,oldNow=Date.now,oldTimer=global.setTimeout;let now=1800000000000;const times=[];Date.now=()=>now;
 global.setTimeout=(fn,ms)=>{now+=ms;fn();return 0};global.fetch=async()=>{times.push(now);return Response.json({result:123})};
 try{const s=initial(),api=new Providers(s);await api.rpc('getSlot');await api.rpc('getTransaction');assert.equal(times[1]-times[0],2200);assert.equal(s.calls,2);assert.equal(api.calls,2);
 }finally{global.fetch=old;Date.now=oldNow;global.setTimeout=oldTimer}
});
test('orçamento de ciclo recusa antes de fetch sem ultrapassar contagem',async()=>{
 const old=global.fetch;global.fetch=async()=>{throw Error('unexpected fetch')};try{const s=initial(),api=new Providers(s);api.calls=36;await assert.rejects(api.rpc('getSlot'),/Orçamento/);assert.equal(api.calls,36);assert.equal(s.calls,0)}finally{global.fetch=old}
});
test('RPC 429 em HTTP 200 também abre cooldown',async()=>{
 const old=global.fetch;global.fetch=async()=>Response.json({error:{code:429}});try{const s=initial();await assert.rejects(new Providers(s).rpc('getSlot'),/429/);assert(s.providerLimits['solana-rpc.publicnode.com'].until>Date.now())}finally{global.fetch=old}
});
