import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,initPortfolios,parseTx,buy,sell,executionBlocked,SOL,USDC,JUP} from '../lib/core.ts';
import {observability} from './helpers/modules.mjs';
const {observeSignal,decision,diagnostics,researchExport,buyEvidence,failureCode}=await import(observability);
const now=Date.parse('2026-11-07T12:00:00Z'),wallet='11111111111111111111111111111111';
const signal=(overrides={})=>({signature:'synthetic-swap',wallet,time:now-2000,detected:now-1000,side:'buy',reason:'fixture',originalPrice:100,...overrides});
function setup(){const s=initial();initPortfolios(s);s.market={sol:100,usdcUsd:1,eurPerUsd:1,fxDate:'2026-11-06',time:now};s.lastSuccess=now;return s;}
function tx(){const balance=(mint,amount,i)=>({owner:wallet,mint,accountIndex:i,uiTokenAmount:{amount,decimals:6}});return {slot:123,version:0,blockTime:now/1000-2,transaction:{message:{accountKeys:[{pubkey:wallet,signer:true}],instructions:[{programId:JUP}]}},meta:{err:null,preTokenBalances:[balance(SOL,'1000000',0),balance(USDC,'200000000',1)],postTokenBalances:[balance(SOL,'2000000',0),balance(USDC,'100000000',1)]}};}

test('parser mantém decisão e acrescenta apenas evidência selecionada',()=>{
 const raw=tx();raw.secret='synthetic-private-token';raw.providerUrl='https://example.invalid/?api-key=synthetic-secret';
 const parsed=parseTx(raw,wallet,'synthetic',now),before=structuredClone(parsed);observeSignal(parsed,raw,false);
 assert.deepEqual({...parsed,audit:undefined},{...before,audit:undefined});assert.equal(parsed.audit.parser.code,'parser_supported_swap');
 assert.equal(parsed.audit.parser.slot,123);assert.equal(parsed.audit.parser.signer,true);assert.equal(parsed.audit.parser.preAccounts,2);
 assert(!JSON.stringify(parsed).includes('synthetic-private-token'));assert(!JSON.stringify(parsed).includes('api-key'));
});
for(const [name,change,code] of [
 ['metadados ausentes',t=>delete t.meta,'parser_metadata_or_failed'],
 ['falha on-chain',t=>t.meta.err={InstructionError:[0,'Custom']},'parser_metadata_or_failed'],
 ['não signatário',t=>t.transaction.message.accountKeys[0].signer=false,'parser_not_signer'],
 ['protocolo não suportado',t=>t.transaction.message.instructions=[],'parser_unsupported_protocol'],
 ['criação de conta',t=>t.meta.preTokenBalances.pop(),'parser_account_lifecycle'],
 ['sem delta SPL',t=>t.meta.postTokenBalances=structuredClone(t.meta.preTokenBalances),'parser_no_balance_change'],
 ['fluxo SOL adicional',t=>t.transaction.message.instructions.push({program:'system',parsed:{type:'transfer',info:{source:wallet,destination:'synthetic-recipient'}}}),'parser_native_flow'],
])test('diagnóstico do parser: '+name,()=>{const raw=tx();change(raw);const s=parseTx(raw,wallet,'synthetic',now);assert.equal(s.side,'ignore');observeSignal(s,raw,true);assert.equal(s.audit.parser.code,code);assert.equal(s.audit.historical,true);});

test('sinais anteriores não recebem decisões inventadas',()=>{
 const s=setup(),sig=signal();s.signals.push(sig);const before=JSON.stringify(s);
 decision(s,sig,'simple','risk','rejected','risk_daily_loss');assert.equal(JSON.stringify(s),before);
 const d=diagnostics(s,now);assert.equal(d.coverage.legacySignalsWithoutStructuredAudit,1);assert.equal(d.decisions.count,0);
});
test('leituras de diagnóstico e exportação não mutam estado ou risco',()=>{
 const s=setup();s.portfolios[0].cash=89;s.portfolios[0].day='old-day';s.portfolios[0].halted=false;
 const before=JSON.stringify(s);diagnostics(s,now);researchExport(s,now);assert.equal(JSON.stringify(s),before);assert.equal(s.portfolios[0].halted,false);
});
test('idade da receção não afirma frescura na origem; limite de 2h é distinto de 180s',()=>{
 const s=setup();s.market.time=now-180001;s.lastSuccess=now-7200000;
 let d=diagnostics(s,now);assert.equal(d.freshness.marketReceiptStale,true);assert.equal(d.freshness.collectionOlderThanTwoHours,false);
 assert.equal(d.freshness.upstreamPriceAgeMs,null);assert.equal(d.freshness.upstreamPriceAgeVerified,false);
 s.lastSuccess--;assert.equal(diagnostics(s,now).freshness.collectionOlderThanTwoHours,true);
 s.market.time=now+1;d=diagnostics(s,now);assert.equal(d.freshness.marketReceiptAgeMs,null);assert.equal(d.freshness.marketReceiptValid,false);
});
test('ausência de dados não se converte em idade zero ou cobertura 100%',()=>{
 const d=diagnostics(initial(),now);assert.equal(d.freshness.lastSuccessAgeMs,null);assert.equal(d.freshness.marketReceiptStale,true);
 assert.equal(d.coverage.fullChainCoverage,null);assert.equal(d.coverage.parserAcceptanceInCurrentLedger,null);assert.equal(d.portfolios.length,0);
});
test('custos explícitos, perdas, drawdown e atrasos vêm de operações exclusivamente virtuais',()=>{
 const s=setup(),p=s.portfolios[0],sig=signal();buy(p,s.config,sig,.09,9,.1,100,{},now);sell(p,{...sig,signature:'synthetic-exit'},8,.1,{},now+1000,50);
 p.series=[{time:now,equity:100},{time:now+1,equity:90},{time:now+2,equity:95}];
 const m=diagnostics(s,now+2000).portfolios[0];assert.equal(m.closed,1);assert.equal(m.losses,1);assert.equal(m.wins,0);assert.equal(m.winRate,0);
 assert(Math.abs(m.realizedPnlEur+1.2)<1e-9);assert(Math.abs(m.explicitEstimatedCostsEur-.2)<1e-9);
 assert.equal(m.embeddedVenueCostsEur,null);assert(Math.abs(m.maxSnapshotDrawdownPct-10)<1e-9);assert(Math.abs(m.currentDrawdownPct-1.2)<1e-9);
 assert.equal(m.executionLagMs.p95,3000);assert.equal(m.detectionLagMs.p95,1000);assert.equal(m.tradingMode,'paper_only');
});
test('filtros de exposição mostram valores, limites e duplicação sem alterar a compra',()=>{
 const s=setup(),p=s.portfolios[0],sig=signal();buy(p,s.config,sig,.09,9,.1,100,{},now);
 const before=JSON.stringify(p),d=buyEvidence(p,s,sig,1,100,.1,100);assert.equal(d.duplicate,true);assert.equal(d.insufficientCash,true);assert.equal(d.tradeLimitExceeded,true);assert.equal(d.walletLimitExceeded,true);assert.equal(d.assetLimitExceeded,true);assert.equal(JSON.stringify(p),before);
});
test('observações com arquivos externos são exportadas como registo ativo incompleto',()=>{
 const s=setup();s.archive={signals:200,logs:1000};s.archivedIgnored={count:400};s.signals=[signal()];
 const x=researchExport(s,now);assert.equal(x.metrics.coverage.externalHistoryNotIncluded,true);assert.equal(x.metrics.retention.runtimeReconciliationRequired,true);
 assert.equal(x.provenance.fullChainHistory,false);assert.equal(x.observations.length,1);assert.equal(x.observations[0].audit,null);assert.equal(x.tradingMode,'paper_only');
});
test('utilização diária não confunde o contador UTC anterior com o dia atual',()=>{
 const s=setup();s.callDay='2026-11-06';s.calls=1499;const d=diagnostics(s,now);assert.equal(d.requests.usedToday,0);assert.equal(s.calls,1499);assert.equal(d.requests.storedDay,'2026-11-06');
});
test('tamanho do snapshot mede bytes UTF-8 e não altera retenção ou histórico',()=>{
 const s=setup();s.logs=[{time:now,message:'Observação com acentuação: ação.'}];const before=JSON.stringify(s),d=diagnostics(s,now);
 assert.equal(d.retention.payloadUtf8Bytes,Buffer.byteLength(before,'utf8'));assert.equal(d.retention.providerTextLimitBytes,2000000);assert.equal(JSON.stringify(s),before);assert.equal(s.paused,false);
});
test('falhas são classificadas sem armazenar a mensagem arbitrária',()=>{
 const s=setup(),sig=signal();observeSignal(sig,tx(),false);
 const error=Error('https://synthetic.invalid/?api-key=DO-NOT-EXPORT');decision(s,sig,'simple','quote','rejected',failureCode(error),{},now);
 assert(!JSON.stringify(sig).includes('DO-NOT-EXPORT'));assert.equal(sig.audit.decisions[0].code,'provider_unavailable');
});
test('limites existentes são aplicados nos seus valores exatos',()=>{
 const s=setup(),sig=signal({time:now-s.config.maxAge*1000});assert.equal(executionBlocked(s,sig,now),null);assert.equal(executionBlocked(s,sig,now+1),'signal_too_old');
 sig.time=now;s.market.time=now-180000;assert.equal(executionBlocked(s,sig,now),null);assert.equal(executionBlocked(s,sig,now+1),'market_stale');
 sig.time=NaN;assert.equal(executionBlocked(s,sig,now),'source_time_invalid');sig.time=now;s.market.sol=Infinity;assert.equal(executionBlocked(s,sig,now),'market_unavailable');
});
