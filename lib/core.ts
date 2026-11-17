export const SOL='So11111111111111111111111111111111111111112';
export const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const JUP='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
export const DFLOW='DF1ow4tspfHX9JwWJsAb9epbkA8hmpSEAtxXy1V27QBH';
// Only published Jito tip destinations may accompany the supported SPL swap.
const JITO_TIPS=new Set(['ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49','Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY','HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe','DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh','96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5','ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt','3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT','DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL']);
const DFLOW_SWAP_DISCRIMINATORS=new Set(['248,198,158,145,225,117,135,200','65,75,63,76,235,91,91,136']);
function base58Prefix(data:unknown):string{
 if(typeof data!=='string'||!data.length||data.length>4096)return '';
 const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let n=0n;
 for(const c of data){const digit=alphabet.indexOf(c);if(digit<0)return '';n=n*58n+BigInt(digit);}
 const bytes:number[]=[];while(n>0n){bytes.push(Number(n&255n));n>>=8n;}bytes.reverse();
 for(let i=0;i<data.length&&data[i]==='1';i++)bytes.unshift(0);
 return bytes.slice(0,8).join(',');
}
export type DiagnosticDetails=Record<string,string|number|boolean|null>;
export type SignalDecision={strategy:string|null;stage:'selection'|'market'|'risk'|'sizing'|'quote'|'accounting';outcome:'rejected'|'executed_virtual'|'not_evaluated';code:string;time:number;details:DiagnosticDetails};
export type SignalAudit={version:1;historical:boolean;parser:{code:string;slot:number|null;transactionVersion:string|number|null;signer:boolean;preAccounts:number;postAccounts:number;invalidBalances:number};decisions:SignalDecision[]};
export type Signal={signature:string;wallet:string;time:number;detected:number;side:'buy'|'sell'|'ignore';reason:string;originalPrice:number|null;audit?:SignalAudit};
export type CollectionWindow={listedAt:number;limit:number;listed:number;cursorFound:boolean|null;eligibleInWindow:number;queued:number;omittedFromBatch:number;windowMayBeTruncated:boolean};
export type CollectionTelemetry={since:number;completedCycles:number;failedCycles:number;marketBlockedCycles:number;consecutiveMarketBlocks:number;consecutiveFailures:number;lastCycle:{run:number;startedAt:number;finishedAt:number|null;outcome:'running'|'completed'|'market_blocked'|'failed';requests:number|null;failureCode:string|null}};
export type Position={wallet:string;qty:number;cost:number;opened:number};
export type Trade={id:string;strategy:string;wallet:string;signature:string;side:string;time:number;sourceTime:number;detected:number;qty:number;price:number;originalPrice:number|null;cost:number;slippage:number;pnl:number|null;reason:string;quote:unknown};
export type Portfolio={id:string;label:string;cash:number;positions:Position[];peak:number;day:string;week:string;dayStart:number;weekStart:number;halted:boolean;losses:Record<string,number>;trades:Trade[];series:{time:number;equity:number}[]};
export type Wallet={address:string;added:number;cursor:string|null;status:string;observed:number;swaps:number;gap:boolean;validatedAt?:number;pending?:{signatures:string[];historical:boolean;through?:string};collectionWindow?:CollectionWindow};
export type Config={capital:number;interval:number;maxTraders:number;perTrade:number;perTrader:number;perAsset:number;daily:number;weekly:number;drawdown:number;slippageBps:number;maxImpact:number;maxAge:number};
export type ArchivedIgnored={count:number;reasons:Record<string,number>;lastCleanup:number;backupFingerprint:string};
export type ArchiveSummary={signals:number;logs:number;series:Record<string,number>;reasons:Record<string,number>;last:number;bytes:number};
export type ArchiveChunk={kind:'signals'|'logs'|'series';portfolio:string;items:unknown[]};
export type State={created:number;config:Config;paused:boolean;wallets:Wallet[];signals:Signal[];portfolios:Portfolio[];logs:{time:number;message:string}[];lastRun:number|null;lastSuccess:number|null;status:string;market:{sol:number;eurPerUsd:number;fxDate:string;time:number;usdcUsd:number;sourceBlocks?:{sol:number|null;usdc:number|null}}|null;benchmark:{qty:number;cost:number;time:number}|null;calls:number;callDay:string;runCount:number;discovery?:{seen:string[];scanned:number;rejected:number;lastScan:number;reasons:Record<string,number>};providerLimits?:Record<string,{until:number;failures:number}>;telemetry?:CollectionTelemetry;archivedIgnored?:ArchivedIgnored;archive?:ArchiveSummary};
export function initial():State {return {created:Date.now(),config:{capital:100,interval:60,maxTraders:3,perTrade:10,perTrader:20,perAsset:30,daily:2,weekly:5,drawdown:10,slippageBps:50,maxImpact:1,maxAge:900},paused:false,wallets:[],signals:[],portfolios:[],logs:[],lastRun:null,lastSuccess:null,status:'Por iniciar',market:null,benchmark:null,calls:0,callDay:'',runCount:0};}
export function log(s:State,message:string){s.logs.push({time:Date.now(),message});}
/** Enforce the existing age limits again after any quote/provider wait. */
export function executionBlocked(s:State,signal:Signal,now=Date.now()):string|null{
 if(!Number.isFinite(signal.time)||signal.time<=0||signal.time>now)return 'source_time_invalid';
 if(now-signal.time>s.config.maxAge*1000)return 'signal_too_old';
 const m=s.market;
 if(!m||![m.sol,m.eurPerUsd,m.usdcUsd,m.time].every(x=>Number.isFinite(x)&&x>0)||m.time>now)return 'market_unavailable';
 if(now-m.time>180000)return 'market_stale';
 return null;
}
export function initPortfolios(s:State){if(s.portfolios.length)return;for(const [id,label] of [['simple','Cópia simples'],['consistent','Consistência'],['two-loss','Pausa após 2 perdas']])s.portfolios.push({id,label,cash:s.config.capital,positions:[],peak:s.config.capital,day:'',week:'',dayStart:s.config.capital,weekStart:s.config.capital,halted:false,losses:{},trades:[],series:[]});}
export function validAddress(a:string){if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a))return false;let n=BigInt(0);const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';for(const c of a)n=n*BigInt(58)+BigInt(alphabet.indexOf(c));let bytes=0;while(n>BigInt(0)){bytes++;n>>=BigInt(8);}return bytes+(a.match(/^1*/)?.[0].length||0)===32;}
export function parseTx(tx:any,wallet:string,signature:string,detected=Date.now()):Signal {
 const result:Signal={signature,wallet,time:(tx?.blockTime||0)*1000,detected,side:'ignore',reason:'Transação ambígua ou fora do par SOL/USDC',originalPrice:null};
 if(!tx?.meta||tx.meta.err){result.reason='Transação falhada ou metadados indisponíveis';return result;}
 const keys=tx.transaction?.message?.accountKeys||[];
 if(!keys.some((k:any)=>k.pubkey===wallet&&k.signer)){result.reason='Carteira não é signatária';return result;}
 const ix=[...(tx.transaction.message.instructions||[]),...(tx.meta.innerInstructions||[]).flatMap((i:any)=>i.instructions||[])];
 const jupiter=ix.some((i:any)=>i.programId===JUP);
 const dflow=ix.some((i:any)=>i.programId===DFLOW&&Array.isArray(i.accounts)&&i.accounts[3]===wallet&&DFLOW_SWAP_DISCRIMINATORS.has(base58Prefix(i.data)));
 if(!jupiter&&!dflow){result.reason='Transferência ou protocolo não suportado';return result;}
 // Conservative: only persistent SPL accounts, no native SOL/rent reconstruction.
 const before=tx.meta.preTokenBalances||[],after=tx.meta.postTokenBalances||[];
 const ownBefore=before.filter((b:any)=>b.owner===wallet),ownAfter=after.filter((b:any)=>b.owner===wallet);
 if(ownBefore.length!==ownAfter.length||ownBefore.some((b:any)=>!ownAfter.some((a:any)=>a.accountIndex===b.accountIndex&&a.mint===b.mint))){result.reason='Criação/fecho de conta: reconciliação de SOL nativo indisponível';return result;}
 const delta:Record<string,number>={};
 for(const [balances,sign] of [[ownBefore,-1],[ownAfter,1]] as const)for(const b of balances){const v=Number(b.uiTokenAmount.amount)/10**b.uiTokenAmount.decimals;delta[b.mint]=(delta[b.mint]||0)+sign*v;}
 const changed=Object.entries(delta).filter(([,v])=>Math.abs(v)>1e-9);
 if(changed.length!==2||!delta[SOL]||!delta[USDC]||delta[SOL]*delta[USDC]>=0){result.reason=changed.length===0?'Sem alteração dos saldos SPL da carteira': 'Par ou fluxos fora do swap SOL/USDC suportado';return result;}
 // Reject direct native transfers and LP/complex instructions rather than infer a swap from net balances alone.
 if(ix.some((i:any)=>i.program==='system'&&i.parsed?.type==='transfer'&&(i.parsed?.info?.destination===wallet||(i.parsed?.info?.source===wallet&&!JITO_TIPS.has(i.parsed?.info?.destination))))){result.reason='Fluxos SOL adicionais: operação ambígua';return result;}
 result.side=delta[SOL]>0?'buy':'sell';result.originalPrice=Math.abs(delta[USDC]/delta[SOL]);result.reason=`Swap ${jupiter?'Jupiter':'DFlow'} SOL embrulhado/USDC confirmado por saldos`;return result;
}
export function equity(p:Portfolio,solEur:number){return p.cash+p.positions.reduce((a,x)=>a+x.qty*solEur,0);}
export function periods(now:number){const d=new Date(now),day=d.toISOString().slice(0,10);const monday=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));monday.setUTCDate(monday.getUTCDate()-((monday.getUTCDay()+6)%7));return {day,week:monday.toISOString().slice(0,10)};}
export function risk(p:Portfolio,c:Config,price:number,now:number){const e=equity(p,price),{day,week}=periods(now);if(p.day!==day){p.day=day;p.dayStart=p.series.at(-1)?.equity??e;}if(p.week!==week){p.week=week;p.weekStart=p.series.at(-1)?.equity??e;}p.peak=Math.max(p.peak,e);if(e<=p.peak*(1-c.drawdown/100))p.halted=true;if(p.halted)return 'Limite de drawdown: suspensão persistente';if(e<=p.dayStart*(1-c.daily/100))return 'Limite de perda diária';if(e<=p.weekStart*(1-c.weekly/100))return 'Limite de perda semanal';return null;}
export function eligible(p:Portfolio,wallet:string){if(p.id==='simple')return true;if(p.id==='two-loss')return (p.losses[wallet]||0)<2;return false;}
export function sampleStats(trades:Trade[]){const pnls=trades.filter(t=>t.pnl!==null).map(t=>t.pnl!);if(!pnls.length)return {n:0,winRate:null,net:0,score:null};const wins=pnls.filter(v=>v>0).length;const n=pnls.length,z=1.96,ph=wins/n;const lower=(ph+z*z/(2*n)-z*Math.sqrt((ph*(1-ph)+z*z/(4*n))/n))/(1+z*z/n);return {n,winRate:wins/n,net:pnls.reduce((a,b)=>a+b,0),score:n>=20?lower*100:null};}
export function validateConfig(v:any):Config {const base=initial().config;for(const k of Object.keys(base) as (keyof Config)[]){if(typeof v[k]!=='number'||!Number.isFinite(v[k]))throw Error('Configuração inválida');}if(v.capital<10||v.capital>100000||![15,30,60,120].includes(v.interval)||!Number.isInteger(v.maxTraders)||v.maxTraders<1||v.maxTraders>3||v.perTrade<=0||v.perTrade>v.perTrader||v.perTrader>v.perAsset||v.perAsset>50||v.daily<=0||v.daily>2||v.weekly<v.daily||v.weekly>5||v.drawdown<v.weekly||v.drawdown>10||v.slippageBps<0||v.slippageBps>100||v.maxImpact<=0||v.maxImpact>1||v.maxAge<60||v.maxAge>1800)throw Error('Limites inválidos: exposição máxima 50%; perdas 2%/5%/10%; até 3 carteiras.');return Object.fromEntries(Object.keys(base).map(k=>[k,v[k]])) as Config;}
export function buy(p:Portfolio,c:Config,signal:Signal,qty:number,spend:number,fee:number,price:number,quote:unknown,now:number){const e=equity(p,price),walletExposure=p.positions.filter(x=>x.wallet===signal.wallet).reduce((a,x)=>a+x.qty*price,0),asset=p.positions.reduce((a,x)=>a+x.qty*price,0);if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(spend)||spend<=0||!Number.isFinite(fee)||fee<0||spend+fee>p.cash||spend+fee>e*c.perTrade/100+1e-6||walletExposure+spend+fee>e*c.perTrader/100||asset+spend+fee>e*c.perAsset/100)return false;
 if(p.trades.some(t=>t.signature===signal.signature&&t.wallet===signal.wallet))return false;
 p.cash-=spend+fee;p.positions.push({wallet:signal.wallet,qty,cost:spend+fee,opened:now});p.trades.push({id:`${p.id}:${signal.wallet}:${signal.signature}`,strategy:p.id,wallet:signal.wallet,signature:signal.signature,side:'buy',time:now,sourceTime:signal.time,detected:signal.detected,qty,price:spend/qty,originalPrice:signal.originalPrice,cost:fee,slippage:c.slippageBps,pnl:null,reason:'Compra virtual ao preço de cotação posterior à deteção',quote});return true;}
export function sell(p:Portfolio,signal:Signal,proceeds:number,fee:number,quote:unknown,now:number,slippage:number){const positions=p.positions.filter(x=>x.wallet===signal.wallet),qty=positions.reduce((a,x)=>a+x.qty,0),cost=positions.reduce((a,x)=>a+x.cost,0);if(qty<=0||!Number.isFinite(proceeds)||proceeds<=0||!Number.isFinite(fee)||fee<0||p.cash+proceeds<fee||p.trades.some(t=>t.signature===signal.signature&&t.wallet===signal.wallet))return false;const pnl=proceeds-fee-cost;p.cash+=proceeds-fee;p.positions=p.positions.filter(x=>x.wallet!==signal.wallet);p.losses[signal.wallet]=pnl<0?(p.losses[signal.wallet]||0)+1:0;p.trades.push({id:`${p.id}:${signal.wallet}:${signal.signature}`,strategy:p.id,wallet:signal.wallet,signature:signal.signature,side:'sell',time:now,sourceTime:signal.time,detected:signal.detected,qty,price:proceeds/qty,originalPrice:signal.originalPrice,cost:fee,slippage,pnl,reason:'Saída total na primeira venda observada do trader',quote});return true;}

// A signer is only a candidate when its own balances prove a supported swap.
export function candidateSignals(tx:any,signature:string):Signal[]{
 const signers=[...new Set<string>((tx?.transaction?.message?.accountKeys||[]).filter((k:any)=>k.signer&&validAddress(k.pubkey)).map((k:any)=>k.pubkey))];
 return signers.map(address=>parseTx(tx,address,signature)).filter(signal=>signal.side!=='ignore');
}
export function ignoredReasons(signals:Signal[],archived:Record<string,number>={}){
 const counts:Record<string,number>={...archived};for(const signal of signals)if(signal.side==='ignore')counts[signal.reason]=(counts[signal.reason]||0)+1;
 return Object.entries(counts).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'pt'));
}

export function candidateReasons(tx:any,signature:string):string[]{
 const signers=[...new Set<string>((tx?.transaction?.message?.accountKeys||[]).filter((k:any)=>k.signer&&validAddress(k.pubkey)).map((k:any)=>k.pubkey))];
 return [...new Set(signers.map(address=>parseTx(tx,address,signature)).filter(s=>s.side==='ignore').map(s=>s.reason))];
}

export async function stateFingerprint(s:State):Promise<string>{
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(s)));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}

/** Only discarded observations are removed; experiment, cursors and risk remain intact. */
export async function cleanupIgnored(s:State,backupFingerprint:unknown){
 if(!s.paused)throw Error('Pausa a recolha antes de exportar e limpar.');
 if(typeof backupFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(backupFingerprint)||backupFingerprint!==await stateFingerprint(s))throw Error('O estado mudou ou falta a cópia de segurança. Exporta novamente antes de limpar.');
 const removed=s.signals.filter(x=>x.side==='ignore');
 if(!removed.length)return {status:'Não existem sinais ignorados para limpar',removed:0,remaining:s.signals.length,paused:s.paused};
 const pending=new Set(s.wallets.flatMap(w=>(w.pending?.signatures||[]).map(signature=>w.address+':'+signature)));
 const archived=removed.filter(x=>!pending.has(x.wallet+':'+x.signature));
 if(!archived.length)return {status:'Sinais pendentes preservados; nada para limpar',removed:0,remaining:s.signals.length,paused:s.paused};
 const reasons=Object.fromEntries(ignoredReasons(archived,s.archivedIgnored?.reasons));
 s.signals=s.signals.filter(x=>x.side!=='ignore'||pending.has(x.wallet+':'+x.signature));
 s.archivedIgnored={count:(s.archivedIgnored?.count||0)+archived.length,reasons,lastCleanup:Date.now(),backupFingerprint};
 log(s,`Limpeza: ${archived.length} sinais ignorados retirados após exportação; swaps, carteiras, operações virtuais e regras de risco preservados.`);
 return {status:`Limpeza concluída: ${archived.length} sinais ignorados retirados. Recolha ainda em pausa.`,removed:archived.length,remaining:s.signals.length,paused:s.paused};
}

/** Move detail to durable archive chunks; never prune trades, risk or pending work. */
export function archiveRecent(s:State,now=Date.now()):ArchiveChunk[]{
 const chunks:ArchiveChunk[]=[];
 const add=(kind:ArchiveChunk['kind'],portfolio:string,items:unknown[])=>{for(let i=0;i<items.length;i+=200)chunks.push({kind,portfolio,items:items.slice(i,i+200)});};
 const pending=new Set(s.wallets.flatMap(w=>(w.pending?.signatures||[]).map(signature=>w.address+':'+signature)));
 const ignored=s.signals.filter(x=>x.side==='ignore'&&!pending.has(x.wallet+':'+x.signature)),removed=ignored.length>500?ignored.slice(0,-250):[];
 if(removed.length){const keys=new Set(removed.map(x=>x.wallet+':'+x.signature));add('signals','',removed);s.signals=s.signals.filter(x=>!keys.has(x.wallet+':'+x.signature));}
 if(s.logs.length>1600)add('logs','',s.logs.splice(0,s.logs.length-1200));
 for(const p of s.portfolios)if(p.series.length>800)add('series',p.id,p.series.splice(0,p.series.length-600));
 if(!chunks.length)return chunks;
 const a=s.archive??={signals:0,logs:0,series:{},reasons:{},last:now,bytes:0};a.signals+=removed.length;
 for(const signal of removed)a.reasons[signal.reason]=(a.reasons[signal.reason]||0)+1;
 for(const chunk of chunks){if(chunk.kind==='logs')a.logs+=chunk.items.length;if(chunk.kind==='series')a.series[chunk.portfolio]=(a.series[chunk.portfolio]||0)+chunk.items.length;a.bytes+=new TextEncoder().encode(JSON.stringify(chunk.items)).byteLength;}
 a.last=now;return chunks;
}

/** Totals for the active state, including automatic archives and manual cleanups. */
export function observationTotals(s:State){
 const reasons={...s.archivedIgnored?.reasons};for(const [reason,n] of Object.entries(s.archive?.reasons||{}))reasons[reason]=(reasons[reason]||0)+n;
 return {signals:s.signals.length+(s.archivedIgnored?.count||0)+(s.archive?.signals||0),swaps:s.signals.filter(x=>x.side!=='ignore').length,logs:s.logs.length+(s.archive?.logs||0),pending:s.wallets.reduce((n,w)=>n+(w.pending?.signatures.length||0),0),ignoredReasons:ignoredReasons(s.signals,reasons)};
}

export function strategyStatus(s:State,p:Portfolio,now=Date.now()){
 if(s.paused)return 'Monitorização em pausa';if(p.halted)return 'Suspensa por drawdown';if(!s.market||now-s.market.time>180000)return 'A aguardar preço atual';
 const block=risk({...p},s.config,s.market.sol*s.market.eurPerUsd,now);if(block)return block;if(!s.wallets.length)return 'A aguardar carteiras';
 if(p.id==='consistent'){const baseline=s.portfolios.find(x=>x.id==='simple');const ready=s.wallets.some(w=>{const st=sampleStats(baseline?.trades.filter(t=>t.wallet===w.address)||[]);return st.n>=20&&st.net>0&&(st.score??0)>=40;});if(!ready)return 'A aguardar amostra consistente';}
 if(p.id==='two-loss'){const suspended=s.wallets.filter(w=>(p.losses[w.address]||0)>=2).length;if(suspended)return `${suspended} trader(s) suspenso(s) após duas perdas`;}
 return 'Em avaliação';
}
