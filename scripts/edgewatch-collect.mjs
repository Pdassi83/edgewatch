import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

// Bind the credential to the one approved Site without publishing its address.
const ORIGIN_HASH='ce8e03ae342bc537d8a49c239f4370da2e2cc1535dee455a977a74180bde4111';
export function checkedOrigin(value,expected=ORIGIN_HASH){
 const origin=String(value||'').trim().replace(/\/$/,'');
 let parsed;try{parsed=new URL(origin);}catch{throw Error('Endereço do laboratório inválido');}
 if(parsed.protocol!=='https:'||parsed.origin!==origin||parsed.username||parsed.password||createHash('sha256').update(origin).digest('hex')!==expected)throw Error('Endereço do laboratório não autorizado');
 return origin;
}
export async function callTool(origin,token,name,fetcher=fetch){
 if(!['collect','status'].includes(name))throw Error('Ferramenta não permitida');
 const headers={'OAI-Sites-Authorization':`Bearer ${token}`};
 const response=await fetcher(`${origin}${name==='collect'?'/api/action':'/api/state'}`,name==='collect'?{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({action:'run'}),signal:AbortSignal.timeout(180000)}:{method:'GET',headers,signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw Error(`Acesso ao laboratório falhou (HTTP ${response.status})`);
 const json=await response.json();if(!json||typeof json!=='object'||json.error)throw Error(`Operação ${name} indisponível`);
 return json;
}
export async function collectAndCheck({origin,token,fetcher=fetch,now=()=>Date.now(),checkOrigin=checkedOrigin}){
 const safeOrigin=checkOrigin(origin);if(typeof token!=='string'||!token.trim())throw Error('Credencial privada em falta');
 let collection=null,collectFailed=false;
 try{collection=await callTool(safeOrigin,token,'collect',fetcher);}catch{collectFailed=true;}
 const status=await callTool(safeOrigin,token,'status',fetcher);
 if(!Number.isFinite(status.lastSuccess)||now()-status.lastSuccess>2*3600000)throw Error('Última recolha confirmada tem mais de duas horas');
 if(collection?.lastSuccess&&status.lastSuccess<collection.lastSuccess)throw Error('A recolha não foi confirmada no estado persistido');
 if(status.portfolios?.some(x=>x.halted)||status.status==='Limite de segurança'||(status.paused&&status.logs?.slice(-5).some(x=>/limite de armazenamento/i.test(x.message||''))))throw Error('O laboratório indicou um limite de segurança');
 return {collection:collection?.status||'Sem confirmação da recolha',status:status.status,paused:status.paused===true,lastSuccess:status.lastSuccess,wallets:status.wallets?.length??null,collectFailed};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const r=await collectAndCheck({origin:process.env.EDGEWATCH_SITE_ORIGIN,token:process.env.EDGEWATCH_SITE_TOKEN});console.log(r.collectFailed?'Recolha sem confirmação; estado consultado.':'Verificação concluída.');}
 catch(e){console.error(`Verificação do laboratório: ${e.message}`);process.exitCode=1;}
}
