import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {encode,core} from './helpers/modules.mjs';

const source=fs.readFileSync('lib/store.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env={get DB(){return globalThis.observationDB}};").replace("from './core'",`from '${core}'`);
const {mutate,readState,readExport}=await import(encode(source));
const {initPortfolios}=await import(core);
function database(t){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:stmt.run(...args)};},async first(){return stmt.get(...args)??null;},execute(){return /^\s*SELECT\b/i.test(sql)?{results:stmt.all(...args),meta:{changes:0}}:{results:[],meta:stmt.run(...args)};}};},async batch(statements){
  sqlite.exec('BEGIN');
  try{const results=statements.map(statement=>statement.execute());if(db.failBatch)sqlite.exec('SELECT invalid_column FROM edge_archive');sqlite.exec('COMMIT');return results;}
  catch(error){sqlite.exec('ROLLBACK');throw error;}
 }};
 globalThis.observationDB=db;return db;
}

function seedArchive(s){
 s.logs=Array.from({length:1700},(_,index)=>({time:index,message:'decision '+index}));
 s.signals=Array.from({length:600},(_,index)=>({signature:'sig'+index,wallet:'w',side:'ignore',reason:'Sem swap',time:index,detected:index,originalPrice:null,audit:{version:1,historical:true,parser:{code:'parser_unsupported_pair',slot:null,transactionVersion:null,signer:false,preAccounts:0,postAccounts:0,invalidBalances:0},decisions:[]}}));
 initPortfolios(s);s.portfolios[0].cash=93;s.portfolios[0].halted=true;s.portfolios[0].losses.w=2;
 for(const portfolio of s.portfolios)portfolio.series=Array.from({length:900},(_,index)=>({time:index,equity:100-index/1000}));
 s.market={sol:100,eurPerUsd:.9,usdcUsd:1,fxDate:'2026-11-06',time:1,sourceBlocks:{sol:123,usdc:124}};
 s.telemetry={since:1,completedCycles:2,failedCycles:1,marketBlockedCycles:0,consecutiveMarketBlocks:0,consecutiveFailures:1,lastCycle:{run:3,startedAt:1,finishedAt:2,outcome:'failed',requests:1,failureCode:'provider_unavailable'}};s.legacyProductionField={keep:true};
}
test('SQL real persiste decisões e capital no mesmo CAS e preserva campos desconhecidos',async t=>{
 const db=database(t);await mutate(async s=>{s.legacyProductionField={keep:true};s.cashSentinel=93;s.signals.push({signature:'synthetic',wallet:'synthetic-wallet',time:1,detected:2,side:'ignore',reason:'fixture',originalPrice:null,audit:{version:1,historical:true,parser:{code:'parser_metadata_or_failed'},decisions:[]}});});
 const s=await readState(),row=await db.prepare('SELECT version,lease,lease_until FROM edge_state').first();assert.equal(row.version,1);assert.equal(row.lease,null);assert.equal(row.lease_until,0);assert.equal(s.cashSentinel,93);assert.equal(s.signals[0].audit.parser.code,'parser_metadata_or_failed');assert.equal(s.legacyProductionField.keep,true);
});
test('lease exclui duas recolhas concorrentes e liberta após confirmação',async t=>{
 const db=database(t);let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const first=mutate(async s=>{entered();await gate;s.status='synthetic-completed';});await ready;
 await assert.rejects(mutate(async()=>assert.fail('must not enter')),/em curso/);release();await first;
 assert.equal((await readState()).status,'synthetic-completed');assert.equal((await db.prepare('SELECT version FROM edge_state').first()).version,1);
});
test('falha no callback não grava decisões parciais e permite uma tentativa futura',async t=>{
 database(t);await assert.rejects(mutate(async s=>{s.status='synthetic-uncommitted';throw Error('synthetic failure');}),/synthetic failure/);
 assert.notEqual((await readState()).status,'synthetic-uncommitted');await mutate(async s=>s.status='synthetic-recovered');assert.equal((await readState()).status,'synthetic-recovered');
});
test('escritor com lease perdido não substitui a versão mais recente nem liberta o novo lease',async t=>{
 const db=database(t);await mutate(async()=>{});
 await assert.rejects(mutate(async s=>{s.status='synthetic-stale-writer';await db.prepare("UPDATE edge_state SET lease='new-owner',version=version+1 WHERE id=1").run();}),/Conflito/);
 assert.notEqual((await readState()).status,'synthetic-stale-writer');const row=await db.prepare('SELECT lease,version FROM edge_state').first();assert.equal(row.lease,'new-owner');assert.equal(row.version,2);
});

test('SQL real arquiva atomicamente e exporta sinais, logs e séries uma única vez',async t=>{
 const db=database(t);await mutate(async s=>seedArchive(s));const active=await readState(),full=await readExport();
 assert.equal(active.logs.length,1200);assert.equal(active.signals.length,250);assert.equal(full.logs.length,1700);assert.equal(full.signals.length,600);
 assert.equal(new Set(full.signals.map(signal=>signal.signature)).size,600);assert.equal(full.signals[0].audit.parser.code,'parser_unsupported_pair');
 assert.equal(full.portfolios[0].cash,93);assert.equal(full.portfolios[0].halted,true);assert.equal(full.portfolios[0].losses.w,2);
 for(const portfolio of full.portfolios)assert.equal(portfolio.series.length,900);
 for(const portfolio of active.portfolios)assert.equal(portfolio.series.length,600);
 assert.deepEqual(full.market.sourceBlocks,{sol:123,usdc:124});assert.deepEqual(full.telemetry,active.telemetry);assert.equal(full.telemetry.completedCycles,2);assert.equal(full.legacyProductionField.keep,true);
 assert.match(full.exportMeta.activeFingerprint,/^[a-f0-9]{64}$/);assert.equal(full.exportMeta.includesArchive,true);
 const count=(await db.prepare('SELECT COUNT(*) AS n FROM edge_archive').first()).n;assert(count>0);
 await mutate(async()=>{});assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM edge_archive').first()).n,count);
 assert.equal((await readState()).signals.length,250);assert.equal((await readExport()).signals.length,600);
});

test('erro no batch reverte o arquivo e o estado juntos',async t=>{
 const db=database(t);await mutate(async()=>{});db.failBatch=true;
 await assert.rejects(mutate(async s=>seedArchive(s)),/invalid_column/);db.failBatch=false;
 const active=await readState(),row=await db.prepare('SELECT version,lease,lease_until FROM edge_state').first();
 assert.equal(active.logs.length,0);assert.equal(active.signals.length,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM edge_archive').first()).n,0);
 assert.equal(row.version,1);assert.equal(row.lease,null);assert.equal(row.lease_until,0);
});

test('escritor que perdeu o lease não grava arquivo nem substitui o estado recente',async t=>{
 const db=database(t);await mutate(async()=>{});
 await assert.rejects(mutate(async s=>{seedArchive(s);await db.prepare("UPDATE edge_state SET lease='new-owner',version=version+1 WHERE id=1").run();}),/Conflito/);
 assert.equal((await readState()).logs.length,0);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM edge_archive').first()).n,0);
 const row=await db.prepare('SELECT lease,version FROM edge_state').first();assert.equal(row.lease,'new-owner');assert.equal(row.version,2);
});
