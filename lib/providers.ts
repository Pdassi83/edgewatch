import {env} from 'cloudflare:workers';
import {SOL,USDC,type State} from './core';
export class Providers {
 calls=0;start=Date.now();lastJup=0;
 private lastRequest:Record<string,number>={};
 constructor(public state:State){}
 private defer(host:string,operation:string,retryAfter:string|null){
  const limits=this.state.providerLimits??={};
  const failures=Math.min((limits[host]?.failures||0)+1,8);
  const seconds=retryAfter?.trim();
  const requested=seconds&&/^\d+(\.\d+)?$/.test(seconds)?Date.now()+Number(seconds)*1000:Date.parse(retryAfter||'');
  const until=Math.max(Date.now()+Math.min(3600000,60000*2**(failures-1)),Number.isFinite(requested)?requested:0);
  limits[host]={until,failures};
  return Error(`${host} · ${operation}: HTTP/RPC 429; próxima tentativa após ${new Date(until).toISOString()}`);
 }
 async request(url:string,options:RequestInit={},operation='GET'){
  const host=new URL(url).hostname;
  const limit=this.state.providerLimits?.[host];
  if(limit&&limit.until>Date.now())throw Error(`${host} · ${operation}: em espera até ${new Date(limit.until).toISOString()}`);
  // Per-host pacing also covers prices/quotes sharing a provider. Never retry a 429 in this cycle.
  const wait=Math.max(0,(this.lastRequest[host]??-Infinity)+2200-Date.now());
  if(Date.now()-this.start+wait+8000>150000||this.calls>=36)throw Error('Orçamento de pedidos por ciclo atingido');
  if(wait)await new Promise(r=>setTimeout(r,wait));
  const day=new Date().toISOString().slice(0,10);
  if(this.state.callDay!==day){this.state.callDay=day;this.state.calls=0;}
  if(this.state.calls>=1500)throw Error('Limite diário de 1500 pedidos atingido');
  this.calls++;this.state.calls++;this.lastRequest[host]=Date.now();
  let r:Response;
  try{r=await fetch(url,{...options,signal:AbortSignal.timeout(8000)});}
  catch{throw Error(`${host} · ${operation}: ligação indisponível ou tempo limite excedido`);}
  if(r.status===429)throw this.defer(host,operation,r.headers.get('retry-after'));
  if(!r.ok)throw Error(`${host} · ${operation}: HTTP ${r.status}; circuito interrompido`);
  return r;
 }
 async json(url:string,options:RequestInit={},operation='GET'){
  const r=await this.request(url,options,operation),j=await r.json() as any;
  if(j?.error?.code===429||j?.error?.code===-32429)throw this.defer(new URL(url).hostname,operation,r.headers.get('retry-after'));
  return j;
 }
 async rpc(method:string,params:unknown[]=[]){const e=env as any;const url=e.HELIUS_API_KEY?`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(e.HELIUS_API_KEY)}`:'https://solana-rpc.publicnode.com';const j=await this.json(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})},method);if(j.error)throw Error(`RPC recusou ${method}: código ${j.error.code}`);return j.result;}
 async quote(inputMint:string,outputMint:string,amount:string){const wait=2200-(Date.now()-this.lastJup);if(wait>0)await new Promise(r=>setTimeout(r,wait));this.lastJup=Date.now();const key=(env as any).JUPITER_API_KEY;const q=await this.json(`https://api.jup.ag/swap/v2/order?${new URLSearchParams({inputMint,outputMint,amount})}`,{headers:key?{'x-api-key':key}:{}});if(q.error||q.errorCode||q.inputMint!==inputMint||q.outputMint!==outputMint||q.inAmount!==amount||!q.routePlan?.length||!Number.isFinite(Number(q.priceImpactPct))||Math.abs(Number(q.priceImpactPct))>this.state.config.maxImpact||!/^\d+$/.test(q.outAmount)||Number(q.outAmount)<=0)throw Error('Cotação sem rota válida, impacto excessivo ou resposta incompleta');if(q.expireAt&&Date.parse(q.expireAt)<Date.now())throw Error('Cotação expirada');return {inputMint,outputMint,inAmount:q.inAmount,outAmount:q.outAmount,priceImpactPct:q.priceImpactPct,feeBps:q.feeBps,platformFee:q.platformFee,routePlan:q.routePlan,receivedAt:Date.now()};}
 async market(){const prices=await this.json(`https://api.jup.ag/price/v3?ids=${SOL},${USDC}`,{headers:(env as any).JUPITER_API_KEY?{'x-api-key':(env as any).JUPITER_API_KEY}:{}});const sol=Number(prices[SOL]?.usdPrice),usdcUsd=Number(prices[USDC]?.usdPrice);if(!(sol>0)||!(usdcUsd>0)||Math.abs(usdcUsd-1)>.01)throw Error('Preço indisponível ou USDC fora da paridade de tolerância');
 const r=await this.request('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',{},'câmbio diário');if(!r.ok)throw Error('Câmbio BCE indisponível');const xml=await r.text(),usd=Number(xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)/)?.[1]),date=xml.match(/time=['"]([\d-]+)/)?.[1];if(!usd||!date||Date.now()-Date.parse(date)>5*86400000)throw Error('Câmbio BCE inválido ou desatualizado');return {sol,usdcUsd,eurPerUsd:1/usd,fxDate:date,time:Date.now()};}
 async feeSol(){const fees=await this.rpc('getRecentPrioritizationFees');if(!Array.isArray(fees)||!fees.length)throw Error('Estimativa de prioridade indisponível');const x=fees.map(f=>Number(f.prioritizationFee)).filter(Number.isFinite).sort((a,b)=>a-b);if(!x.length)throw Error('Comissões inválidas');return Math.max(50000,5000+x[Math.floor(x.length*.75)]*200000/1e6)/1e9;}
}
