import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {initial,initPortfolios} from '../lib/core.ts';
import {observability,scout} from './helpers/modules.mjs';
const source=fs.readFileSync('components/lab-diagnostics.tsx','utf8').replace("from '@/lib/observability'",`from '${observability}'`).replace("from '@/lib/scout'",`from '${scout}'`);
const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}).replace(/from ["']react\/jsx-runtime["']/,`from '${import.meta.resolve('react/jsx-runtime')}'`);
const {LabDiagnostics}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('painel vazio explica dados desconhecidos e só oferece exportação de leitura',()=>{
 const html=renderToStaticMarkup(React.createElement(LabDiagnostics,{state:initial()}));assert(html.includes('Desconhecida'));assert(html.includes('Cobertura total da blockchain desconhecida'));assert(html.includes('/api/diagnostics?export=1'));assert(!html.includes('<form'));assert(!html.includes('<button'));
});
test('painel distingue suspensão virtual e evidência real de um sinal rejeitado',()=>{
 const s=initial();initPortfolios(s);s.portfolios[2].losses['synthetic-wallet']=2;s.signals=[{signature:'synthetic-signature',wallet:'synthetic-wallet',time:1,detected:2,side:'ignore',reason:'<script>synthetic-content</script>',originalPrice:null}];
 const html=renderToStaticMarkup(React.createElement(LabDiagnostics,{state:s}));assert(html.includes('Resultados exclusivamente virtuais'));assert(html.includes('1 trader(s) suspenso(s)'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>synthetic-content'));
});

test('SCOUT exibe compatibilidade e alerta para amostra insuficiente sem criar ações de negociação',()=>{
 const state=initial();const now=Date.now();state.wallets=[{address:'synthetic-wallet',added:now-1000,cursor:null,status:'Em observação',observed:2,swaps:1,gap:true}];
 const html=renderToStaticMarkup(React.createElement(LabDiagnostics,{state}));
 assert(html.includes('SCOUT | Triagem de carteiras'));
 assert(html.includes('Amostra insuficiente'));
 assert(html.includes('O SCOUT não substitui carteiras'));
 assert(!html.includes('buy now'));
});

test('SCOUT conserva a fila v10 e a distinção entre drawdown ativo e histórico arquivado',()=>{
 const state=initial(),now=Date.now();initPortfolios(state);
 state.wallets=[{address:'synthetic-queued-wallet',added:now-1000,cursor:null,status:'Em observação',observed:40,swaps:8,gap:true,
  pending:{signatures:['synthetic-pending'],historical:false,through:'synthetic-through'},
  collectionWindow:{listedAt:now-100,limit:128,listed:20,cursorFound:true,eligibleInWindow:7,queued:7,omittedFromBatch:0,windowMayBeTruncated:false}}];
 state.archive={signals:0,logs:0,series:{simple:2},reasons:{},last:now-100,bytes:100};
 state.portfolios[0].series=[{time:now-1,equity:90}];
 const before=JSON.stringify(state),html=renderToStaticMarkup(React.createElement(LabDiagnostics,{state}));
 assert(html.includes('SCOUT | Triagem de carteiras'));
 assert(html.includes('Rever cobertura e atrasos'));
 assert(html.includes('<th>Fila criada</th>'));
 assert(html.includes('<td>7</td>'));
 assert(html.includes('128 entradas'));
 assert(html.includes('arquivo não carregado'));
 assert(!html.includes('Fora do lote'));
 assert.equal(JSON.stringify(state),before);
});
