import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('scout-preview/index.html','utf8');
const config=JSON.parse(readFileSync('scout-preview/vercel.json','utf8'));
const csp=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy')?.value||'';

test('SCOUT standalone sem endereços, URLs de RPC ou endpoints do laboratório',()=>{
 assert(html.includes('SCOUT'));
 assert(html.includes('Carteira 01'));
 assert(!/solana-rpc|api\.jup\.ag|helius|edgewatch-lab-fernando|EPjFWdd5Aufq|JUP6LkbZ/.test(html));
 assert(!/fetch\s*\(|XMLHttpRequest|WebSocket\s*\(|sendTransaction|privateKey/.test(html));
});

test('browser CSP e cabeçalhos reduzem fuga de dados importados',()=>{
 assert(html.includes("connect-src 'none'"));
 assert(csp.includes("connect-src 'none'"));
 assert(csp.includes("form-action 'none'"));
 assert(csp.includes("frame-ancestors 'none'"));
 const headers=Object.fromEntries(config.headers[0].headers.map(x=>[x.key,x.value]));
 assert.equal(headers['Referrer-Policy'],'no-referrer');
 assert(headers['X-Robots-Tag'].includes('noindex'));
});

test('importação é local e indicação de limites fica explícita',()=>{
 assert(html.includes('f.text()'));
 assert(html.includes('5e6'));
 assert(html.includes('wallets.length>100'));
 assert(html.includes('Não existe atualização automática'));
 assert(html.includes('Sem trading real'));
});
