import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,initPortfolios,cleanupIgnored,stateFingerprint,ignoredReasons} from '../lib/core.ts';

const signal=(signature,side='ignore',wallet='wallet',reason='Sem saldo')=>({signature,side,wallet,reason,time:1,detected:2,originalPrice:null});
function fixture(){
 const s=initial();s.paused=true;initPortfolios(s);
 s.wallets=[{address:'wallet',added:1,cursor:'last-seen',status:'Swap compatível confirmado',observed:20,swaps:2,gap:true}];
 s.signals=[signal('ignore-1'),signal('buy','buy'),signal('ignore-2'),signal('sell','sell')];
 s.logs=[{time:1,message:'Registo anterior'}];s.lastRun=10;s.lastSuccess=11;s.runCount=7;s.calls=15;s.callDay='2026-11-06';
 s.market={sol:100,eurPerUsd:.9,fxDate:'2026-11-06',time:11,usdcUsd:1};s.benchmark={qty:1,cost:100,time:1};
 s.portfolios[0].cash=86;s.portfolios[0].positions=[{wallet:'wallet',qty:.1,cost:10,opened:1}];
 s.portfolios[0].trades=[{id:'kept-trade',wallet:'wallet',signature:'buy',side:'buy',pnl:null}];
 s.portfolios[2].losses.wallet=2;s.portfolios[2].halted=true;s.portfolios[2].peak=103;s.portfolios[2].dayStart=99;s.portfolios[2].weekStart=100;
 s.portfolios.forEach(p=>p.series=[{time:1,equity:100},{time:11,equity:98}]);
 s.discovery={seen:['discovered'],scanned:9,rejected:8,lastScan:4,reasons:{unsupported:8}};
 s.providerLimits={'test-provider':{until:12345,failures:2}};
 return s;
}
test('limpa só ignorados e conserva integralmente resultados, risco, cursores e orçamento',async()=>{
 const s=fixture(),before=structuredClone(s),proof=await stateFingerprint(s);
 const result=await cleanupIgnored(s,proof);
 assert.equal(result.removed,2);assert.equal(result.remaining,2);assert.equal(result.paused,true);
 assert.deepEqual(s.signals,before.signals.filter(x=>x.side!=='ignore'));
 for(const key of Object.keys(before).filter(k=>!['signals','logs'].includes(k)))assert.deepEqual(s[key],before[key],key);
 assert.deepEqual(s.logs.slice(0,-1),before.logs);assert.match(s.logs.at(-1).message,/2 sinais ignorados/);
 assert.equal(s.archivedIgnored.backupFingerprint,proof);assert.equal(s.archivedIgnored.count,2);
 assert.deepEqual(ignoredReasons(s.signals,s.archivedIgnored.reasons),[['Sem saldo',2]]);
});
test('recusa limpeza sem pausa, sem cópia ou com cópia desatualizada e não altera dados',async()=>{
 const s=fixture();s.paused=false;let before=structuredClone(s);
 await assert.rejects(cleanupIgnored(s,await stateFingerprint(s)),/Pausa/);assert.deepEqual(s,before);
 s.paused=true;const old=await stateFingerprint(s);s.logs.push({time:3,message:'Uma alteração depois da cópia'});before=structuredClone(s);
 for(const proof of [undefined,'wrong','0'.repeat(64),old]){
  await assert.rejects(cleanupIgnored(s,proof),/cópia de segurança/);assert.deepEqual(s,before);
 }
});
test('preserva ignorados referidos por um lote pendente, por carteira e assinatura',async()=>{
 const s=fixture();s.wallets[0].pending={signatures:['ignore-1'],historical:false,through:'ignore-1'};
 s.signals.push(signal('ignore-1','ignore','other-wallet','Outra razão'));
 const before=structuredClone(s.wallets),result=await cleanupIgnored(s,await stateFingerprint(s));
 assert.equal(result.removed,2);assert.deepEqual(s.wallets,before);
 assert(s.signals.some(x=>x.wallet==='wallet'&&x.signature==='ignore-1'));
 assert(!s.signals.some(x=>x.wallet==='other-wallet'));
});
test('limpezas posteriores acumulam motivos e totais sem alterar o histórico das estratégias',async()=>{
 const s=fixture(),before=structuredClone(s.portfolios);
 await cleanupIgnored(s,await stateFingerprint(s));s.signals.push(signal('ignore-3','ignore','wallet','Protocolo não suportado'));
 await cleanupIgnored(s,await stateFingerprint(s));
 assert.equal(s.archivedIgnored.count,3);assert.deepEqual(ignoredReasons(s.signals,s.archivedIgnored.reasons),[['Sem saldo',2],['Protocolo não suportado',1]]);
 assert.deepEqual(s.portfolios,before);const empty=structuredClone(s);
 assert.equal((await cleanupIgnored(s,await stateFingerprint(s))).removed,0);assert.deepEqual(s,empty);
});
