import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initial,initPortfolios} from '../lib/core.ts';
import {encode,core,observability} from './helpers/modules.mjs';
const source=fs.readFileSync('app/api/diagnostics/route.ts','utf8').replace("import {readState} from '@/lib/store';","const readState=async()=>{globalThis.diagnosticReads++;if(globalThis.failDiagnosticRead)throw Error('synthetic-private-database-message');return globalThis.diagnosticState};").replace("from '@/lib/observability'",`from '${observability}'`);
const {GET}=await import(encode(source));
function setup(){globalThis.diagnosticState=initial();globalThis.diagnosticReads=0;globalThis.failDiagnosticRead=false;globalThis.diagnosticCollections=0;}
test('endpoint de diagnóstico só lê um estado persistido e impede cache',async()=>{
 setup();const before=JSON.stringify(diagnosticState),r=await GET(new Request('https://synthetic.invalid/api/diagnostics'));
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).tradingMode,'paper_only');assert.equal(diagnosticReads,1);assert.equal(JSON.stringify(diagnosticState),before);
});
test('exportação tem esquema explícito e separa observações reais de operações virtuais',async()=>{
 setup();const r=await GET(new Request('https://synthetic.invalid/api/diagnostics?export=1')),x=await r.json();
 assert.equal(r.headers.get('content-disposition'),'attachment; filename="edgewatch-research.json"');assert.equal(x.schemaVersion,2);assert.equal(x.kind,'edgewatch_research_snapshot');assert.equal(x.provenance.observations,'real_finalized_rpc_sample');assert.equal(x.provenance.executions,'virtual_quote_based');assert.equal(x.provenance.runtimeSource,'sites_v10_reconciled');assert.equal(x.provenance.archiveDetailsIncluded,false);assert.equal(diagnosticReads,1);
});
test('falha de base de dados não expõe a mensagem interna',async()=>{
 setup();globalThis.failDiagnosticRead=true;const r=await GET(new Request('https://synthetic.invalid/api/diagnostics'));assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');assert(!JSON.stringify(await r.json()).includes('private-database'));
});
const mcp=fs.readFileSync('app/mcp/route.ts','utf8').replace("import {run} from '@/lib/runner';","const run=async()=>{globalThis.diagnosticCollections++;throw Error('unexpected collection')};").replace("from '@/lib/core'",`from '${core}'`).replace("import {readState} from '@/lib/store';","const readState=async()=>globalThis.diagnosticState;").replace("from '@/lib/observability'",`from '${observability}'`);
const {POST}=await import(encode(mcp));
const mcpRequest=body=>new Request('https://synthetic.invalid/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:1,...body})});
test('status MCP preserva totais, fila e métricas v10 sem expor assinaturas ou recolher',async()=>{
 setup();const state=diagnosticState,now=Date.now();initPortfolios(state);state.market={sol:100,eurPerUsd:1,usdcUsd:1,fxDate:new Date(now).toISOString().slice(0,10),time:now};state.calls=12;state.callDay='synthetic-day';
 state.wallets=[{address:'synthetic-wallet',added:now-1,cursor:null,status:'fixture',observed:2,swaps:1,gap:false,pending:{signatures:['private-pending-signature'],historical:true,through:'private-through'}}];
 state.discovery={seen:['private-discovery-signature'],scanned:8,rejected:2,lastScan:now,reasons:{unsupported:2}};
 state.archivedIgnored={count:3,reasons:{removed:3},lastCleanup:now,backupFingerprint:'a'.repeat(64)};state.archive={signals:7,logs:9,series:{simple:4},reasons:{archived:7},last:now,bytes:100};
 state.signals=[{signature:'supported',wallet:'synthetic-wallet',time:now-2,detected:now-1,side:'buy',reason:'supported',originalPrice:100},{signature:'ignored',wallet:'synthetic-wallet',time:now-2,detected:now-1,side:'ignore',reason:'ignored',originalPrice:null}];
 const before=JSON.stringify(state),r=await POST(mcpRequest({method:'tools/call',params:{name:'status'}})),body=await r.json(),s=JSON.parse(body.result.content[0].text);
 assert.equal(s.status,state.status);assert.equal(s.signals,12);assert.equal(s.swaps,1);assert.equal(s.pending,1);assert.deepEqual(s.archive,state.archive);assert.deepEqual(s.archivedIgnored,state.archivedIgnored);assert.deepEqual(s.calls,{used:12,day:'synthetic-day',max:1500});
 assert.deepEqual(s.wallets[0].pending,{count:1,historical:true});assert.deepEqual(s.discovery,{scanned:8,rejected:2,lastScan:now,reasons:{unsupported:2}});assert.equal(s.portfolios[0].closed,0);assert.equal(s.portfolios[0].realized,0);assert.equal(s.portfolios[0].equity,100);assert.equal(s.portfolios[0].totalPnl,0);assert.equal(typeof s.portfolios[0].status,'string');assert.equal(s.portfolios[0].positions,0);
 assert.equal(s.diagnostics.tradingMode,'paper_only');assert.equal(diagnosticCollections,0);assert.equal(JSON.stringify(state),before);assert(!JSON.stringify(s).includes('private-pending-signature'));assert(!JSON.stringify(s).includes('private-through'));assert(!JSON.stringify(s).includes('private-discovery-signature'));
});
test('MCP conserva versão 0.2 e apenas as ferramentas existentes',async()=>{
 setup();const initialized=await (await POST(mcpRequest({method:'initialize'}))).json(),listed=await (await POST(mcpRequest({method:'tools/list'}))).json();assert.equal(initialized.result.serverInfo.version,'0.2.0');assert.deepEqual(listed.result.tools.map(tool=>tool.name),['collect','status']);assert.equal(diagnosticCollections,0);
});
const stateRoute=fs.readFileSync('app/api/state/route.ts','utf8').replace("import {readState,readExport} from '@/lib/store';","const readState=async()=>{globalThis.stateReads++;if(globalThis.failStateRead)throw Error('private-database-error');return globalThis.diagnosticState};const readExport=async()=>{globalThis.exportReads++;return globalThis.fullExport};");
const {GET:stateGET}=await import(encode(stateRoute));
test('API de estado mantém exportação completa separada do registo ativo',async()=>{
 setup();globalThis.stateReads=0;globalThis.exportReads=0;globalThis.failStateRead=false;globalThis.fullExport={...diagnosticState,signals:[{signature:'archived-fixture'}],exportMeta:{includesArchive:true,activeFingerprint:'a'.repeat(64)}};
 const active=await stateGET(new Request('https://synthetic.invalid/api/state')),exported=await stateGET(new Request('https://synthetic.invalid/api/state?export=1'));
 assert.equal(active.headers.get('cache-control'),'no-store');assert.equal(exported.headers.get('cache-control'),'no-store');assert.deepEqual(await active.json(),diagnosticState);assert.deepEqual(await exported.json(),fullExport);assert.equal(stateReads,1);assert.equal(exportReads,1);
 globalThis.failStateRead=true;const failed=await stateGET(new Request('https://synthetic.invalid/api/state'));assert.equal(failed.status,503);assert(!JSON.stringify(await failed.json()).includes('private-database'));
});
