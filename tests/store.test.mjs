import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {encode,core} from './helpers/modules.mjs';

const source=fs.readFileSync('lib/store.ts','utf8').replace("import {env} from 'cloudflare:workers';","const env={get DB(){return globalThis.observationDB}};").replace("from './core'",`from '${core}'`);
const {mutate,readState}=await import(encode(source));
function database(t){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const file of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 const db={prepare(sql){const stmt=sqlite.prepare(sql);let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:stmt.run(...args)};},async first(){return stmt.get(...args)??null;}};}};
 globalThis.observationDB=db;return db;
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
