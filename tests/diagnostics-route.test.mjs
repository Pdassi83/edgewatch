import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial} from '../lib/core.ts';
import {encode,observability} from './helpers/modules.mjs';
const source=fs.readFileSync('app/api/diagnostics/route.ts','utf8').replace("import {readState} from '@/lib/store';","const readState=async()=>{globalThis.diagnosticReads++;if(globalThis.failDiagnosticRead)throw Error('synthetic-private-database-message');return globalThis.diagnosticState};").replace("from '@/lib/observability'",`from '${observability}'`);
const {GET}=await import(encode(source));
function setup(){globalThis.diagnosticState=initial();globalThis.diagnosticReads=0;globalThis.failDiagnosticRead=false;}
test('endpoint de diagnóstico só lê um estado persistido e impede cache',async()=>{
 setup();const before=JSON.stringify(diagnosticState),r=await GET(new Request('https://synthetic.invalid/api/diagnostics'));
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).tradingMode,'paper_only');assert.equal(diagnosticReads,1);assert.equal(JSON.stringify(diagnosticState),before);
});
test('exportação tem esquema explícito e separa observações reais de operações virtuais',async()=>{
 setup();const r=await GET(new Request('https://synthetic.invalid/api/diagnostics?export=1')),x=await r.json();
 assert.equal(r.headers.get('content-disposition'),'attachment; filename="edgewatch-research.json"');assert.equal(x.schemaVersion,1);assert.equal(x.kind,'edgewatch_research_snapshot');assert.equal(x.provenance.observations,'real_finalized_rpc_sample');assert.equal(x.provenance.executions,'virtual_quote_based');assert.equal(diagnosticReads,1);
});
test('falha de base de dados não expõe a mensagem interna',async()=>{
 setup();globalThis.failDiagnosticRead=true;const r=await GET(new Request('https://synthetic.invalid/api/diagnostics'));assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert(!JSON.stringify(await r.json()).includes('private-database'));
});
const mcp=fs.readFileSync('app/mcp/route.ts','utf8').replace("import {run} from '@/lib/runner';","const run=async()=>{throw Error('unexpected collection')};").replace("import {ignoredReasons} from '@/lib/core';","const ignoredReasons=()=>[];").replace("import {readState} from '@/lib/store';","const readState=async()=>globalThis.diagnosticState;").replace("from '@/lib/observability'",`from '${observability}'`);
const {POST}=await import(encode(mcp));
test('status MCP mantém os campos existentes e acrescenta diagnóstico sem collect',async()=>{
 setup();const r=await POST(new Request('https://synthetic.invalid/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'status'}})}));
 const body=await r.json(),s=JSON.parse(body.result.content[0].text);assert.equal(s.status,diagnosticState.status);assert.equal(s.signals,0);assert.deepEqual(s.wallets,[]);assert.equal(s.diagnostics.tradingMode,'paper_only');
});
