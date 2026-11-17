import {env} from 'cloudflare:workers';
import {initial,archiveRecent,stateFingerprint,type State,type Signal,type ArchiveChunk} from './core';
const db=()=> (env as any).DB as D1Database;
export async function readState():Promise<State>{const r=await db().prepare('SELECT payload FROM edge_state WHERE id=1').first<{payload:string}>();return r?JSON.parse(r.payload):initial();}
/** Read one consistent snapshot: a concurrent collection cannot hide archived records. */
export async function readExport(){
 const database=db(),result=await database.batch([
  database.prepare('SELECT payload FROM edge_state WHERE id=1'),
  database.prepare('SELECT kind,portfolio,payload FROM edge_archive ORDER BY created,id'),
 ]);
 const row=result[0].results[0] as {payload:string}|undefined;
 const s:State=row?JSON.parse(row.payload):initial(),activeFingerprint=await stateFingerprint(s);
 for(const row of result[1].results as {kind:ArchiveChunk['kind'];portfolio:string;payload:string}[]){
  const items=JSON.parse(row.payload);
  if(row.kind==='signals')s.signals.push(...items as Signal[]);
  if(row.kind==='logs')s.logs.push(...items);
  if(row.kind==='series')s.portfolios.find(p=>p.id===row.portfolio)?.series.push(...items);
 }
 s.signals.sort((a,b)=>a.detected-b.detected);s.logs.sort((a,b)=>a.time-b.time);
 for(const p of s.portfolios)p.series.sort((a,b)=>a.time-b.time);
 return {...s,exportMeta:{includesArchive:true,activeFingerprint,exportedAt:Date.now(),manuallyRemovedObservations:s.archivedIgnored?.count||0}};
}

export async function mutate<T>(fn:(s:State)=>Promise<T>):Promise<T>{
 const token=crypto.randomUUID(),now=Date.now(),database=db();
 await database.prepare('INSERT OR IGNORE INTO edge_state(id,version,payload,lease_until) VALUES(1,0,?,0)').bind(JSON.stringify(initial())).run();
 const lock=await database.prepare('UPDATE edge_state SET lease=?,lease_until=? WHERE id=1 AND lease_until<?').bind(token,now+240000,now).run();
 if(!lock.meta.changes)throw Error('Já existe uma recolha em curso. Tenta novamente dentro de alguns minutos.');
 try{
  const row=await database.prepare('SELECT payload,version FROM edge_state WHERE id=1').first<{payload:string;version:number}>();
  const s:State=JSON.parse(row!.payload),result=await fn(s),archive=archiveRecent(s);
  // Archive inserts and state CAS share one transaction; stale writers cannot append history.
  const statements=archive.map((chunk,index)=>database.prepare('INSERT INTO edge_archive(id,created,kind,portfolio,payload) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM edge_state WHERE id=1 AND lease=? AND version=?)').bind(String(row!.version).padStart(12,'0')+':'+String(index).padStart(6,'0'),Date.now(),chunk.kind,chunk.portfolio,JSON.stringify(chunk.items),token,row!.version));
  statements.push(database.prepare('UPDATE edge_state SET payload=?,version=version+1,lease=NULL,lease_until=0 WHERE id=1 AND lease=? AND version=?').bind(JSON.stringify(s),token,row!.version));
  const saved=await database.batch(statements);
  if(!saved.at(-1)?.meta.changes)throw Error('Conflito de persistência: nenhuma operação confirmada.');
  return result;
 }finally{await database.prepare('UPDATE edge_state SET lease=NULL,lease_until=0 WHERE id=1 AND lease=?').bind(token).run();}
}
