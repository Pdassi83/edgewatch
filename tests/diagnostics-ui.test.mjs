import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {initial,initPortfolios} from '../lib/core.ts';
import {observability} from './helpers/modules.mjs';
const source=fs.readFileSync('components/lab-diagnostics.tsx','utf8').replace("from '@/lib/observability'",`from '${observability}'`);
const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}).replace(/from ["']react\/jsx-runtime["']/,`from '${import.meta.resolve('react/jsx-runtime')}'`);
const {LabDiagnostics}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
test('painel vazio explica dados desconhecidos e só oferece exportação de leitura',()=>{
 const html=renderToStaticMarkup(React.createElement(LabDiagnostics,{state:initial()}));assert(html.includes('Desconhecida'));assert(html.includes('Cobertura total da blockchain desconhecida'));assert(html.includes('/api/diagnostics?export=1'));assert(!html.includes('<form'));assert(!html.includes('<button'));
});
test('painel distingue suspensão virtual e evidência real de um sinal rejeitado',()=>{
 const s=initial();initPortfolios(s);s.portfolios[2].losses['synthetic-wallet']=2;s.signals=[{signature:'synthetic-signature',wallet:'synthetic-wallet',time:1,detected:2,side:'ignore',reason:'<script>synthetic-content</script>',originalPrice:null}];
 const html=renderToStaticMarkup(React.createElement(LabDiagnostics,{state:s}));assert(html.includes('Resultados exclusivamente virtuais'));assert(html.includes('1 trader(s) suspenso(s)'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>synthetic-content'));
});
