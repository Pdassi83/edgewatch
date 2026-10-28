import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checkedOrigin,callTool,collectAndCheck} from '../scripts/edgewatch-collect.mjs';

test('o endereço é verificado antes de transmitir qualquer credencial',()=>{
 const origin='https://example.pdassi.chatgpt.site';const hash=createHash('sha256').update(origin).digest('hex');
 assert.equal(checkedOrigin(origin+'/',hash),origin);
 assert.throws(()=>checkedOrigin('https://elsewhere.example',hash));
 assert.throws(()=>checkedOrigin('http://example.pdassi.chatgpt.site',hash));
 assert.throws(()=>checkedOrigin(origin+'/path',hash));
});
test('só permite collect e status e não envia transações',async()=>{
 const calls=[];const fetcher=async(url,request)=>{calls.push([url,JSON.parse(request.body)]);return Response.json({status:'ok'})};
 await callTool('https://example.pdassi.chatgpt.site','test-token','collect',fetcher);
 assert.equal(calls[0][0],'https://example.pdassi.chatgpt.site/api/action');assert.deepEqual(calls[0][1],{action:'run'});
 await assert.rejects(callTool('https://example.pdassi.chatgpt.site','test-token','transfer',fetcher));assert.equal(calls.length,1);
});
test('recusa uma resposta da aplicação que reporte erro',async()=>{
 const fetcher=async()=>Response.json({error:'erro'});
 await assert.rejects(callTool('https://example.pdassi.chatgpt.site','test-token','collect',fetcher),/indisponível/);
});
test('recolhe primeiro e confirma em status o resultado persistido',async()=>{
 const methods=[];const now=1800000000000;const fetcher=async(_url,req)=>{const name=req.method==='POST'?'collect':'status';methods.push(name);return Response.json(name==='collect'?{status:'Recolha concluída',lastSuccess:now}:{status:'Recolha concluída',lastSuccess:now,paused:false,wallets:[]})};
 const result=await collectAndCheck({origin:'https://example.pdassi.chatgpt.site',token:'test-token',fetcher,now:()=>now,checkOrigin:x=>x});
 assert.deepEqual(methods,['collect','status']);assert.equal(result.collectFailed,false);
});
test('consulta status mesmo quando collect falha e deteta dados antigos',async()=>{
 const methods=[];const now=1800000000000;const fetcher=async(_url,req)=>{const name=req.method==='POST'?'collect':'status';methods.push(name);if(name==='collect')return Response.json({error:'temporário'});return Response.json({lastSuccess:now-2*3600000-1})};
 await assert.rejects(collectAndCheck({origin:'https://example.pdassi.chatgpt.site',token:'test-token',fetcher,now:()=>now,checkOrigin:x=>x}),/mais de duas horas/);assert.deepEqual(methods,['collect','status']);
});
test('rejeita uma recolha que não aparece no estado guardado',async()=>{
 const now=1800000000000;const fetcher=async(_url,req)=>Response.json({lastSuccess:req.method==='POST'?now:now-1});
 await assert.rejects(collectAndCheck({origin:'https://example.pdassi.chatgpt.site',token:'test-token',fetcher,now:()=>now,checkOrigin:x=>x}),/não foi confirmada/);
});
test('deteta uma estratégia suspensa por risco',async()=>{
 const now=1800000000000;const fetcher=async()=>Response.json({lastSuccess:now,portfolios:[{halted:true}]});
 await assert.rejects(collectAndCheck({origin:'https://example.pdassi.chatgpt.site',token:'test-token',fetcher,now:()=>now,checkOrigin:x=>x}),/limite de segurança/);
});
