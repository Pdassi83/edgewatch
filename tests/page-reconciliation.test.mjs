import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {initial,initPortfolios} from '../lib/core.ts';
import {core} from './helpers/modules.mjs';

const source=fs.readFileSync('app/page.tsx','utf8')
 .replace("import {useEffect,useState,useRef} from 'react';","const useState=(...args)=>globalThis.pageHooks.useState(...args);const useRef=(...args)=>globalThis.pageHooks.useRef(...args);const useEffect=()=>{};")
 .replace("from 'lucide-react'",`from '${import.meta.resolve('lucide-react')}'`)
 .replace("from '@/lib/core'",`from '${core}'`)
 .replace("import {LabDiagnostics} from '@/components/lab-diagnostics';","const LabDiagnostics=()=>null;");
const compiled=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}).replace(/from ["']react\/jsx-runtime["']/,`from '${import.meta.resolve('react/jsx-runtime')}'`);
const {default:Home}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):typeof node==='string'||typeof node==='number'?String(node):'';
const elements=node=>Array.isArray(node)?node.flatMap(elements):node&&typeof node==='object'&&node.props?[node,...elements(node.props.children)]:[];
const find=(tree,type,label)=>{const found=elements(tree).find(node=>node.type===type&&text(node)===label);assert(found,`${type}: ${label}`);return found;};
const field=(tree,label)=>{const parent=find(tree,'label',label),input=elements(parent).find(node=>node.type==='input');assert(input);return input;};
function harness(state){
 const values=[];let cursor=0;
 const hooks={useState(value){const index=cursor++;if(!Object.hasOwn(values,index))values[index]=index===0?state:value;return [values[index],next=>{values[index]=typeof next==='function'?next(values[index]):next;}];},useRef(value){const index=cursor++;if(!Object.hasOwn(values,index))values[index]={current:value};return values[index];}};
 return {render(){cursor=0;globalThis.pageHooks=hooks;return Home();}};
}
function fixture(){const state=initial();initPortfolios(state);state.paused=true;state.market={sol:100,eurPerUsd:1,usdcUsd:1,fxDate:'2026-11-06',time:Date.now()};return state;}

test('edição de configuração sobrevive a uma atualização após ação do painel',async t=>{
 const state=fixture(),page=harness(state),requests=[],oldFetch=globalThis.fetch;t.after(()=>{globalThis.fetch=oldFetch;});
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return Response.json(url==='/api/action'?{status:'fixture'}:state);};
 let tree=page.render();find(tree,'button','Configurações').props.onClick();tree=page.render();field(tree,'Exposição por operação (%)').props.onChange({target:{value:'7'}});tree=page.render();assert.equal(field(tree,'Exposição por operação (%)').props.value,7);
 await find(tree,'button','Recolher agora').props.onClick();tree=page.render();assert.equal(field(tree,'Exposição por operação (%)').props.value,7);assert.equal(JSON.parse(requests[0].options.body).action,'run');assert.equal(requests[1].url,'/api/state');
});

test('exportação descarrega o arquivo do servidor e só então autoriza limpeza com fingerprint',async t=>{
 const state=fixture(),page=harness(state),fingerprint='a'.repeat(64),archived={signature:'archived-fixture',wallet:'synthetic-wallet',time:1,detected:2,side:'ignore',reason:'fixture',originalPrice:null},full={...state,signals:[archived],exportMeta:{includesArchive:true,activeFingerprint:fingerprint}},requests=[];
 const oldFetch=globalThis.fetch,oldDocument=globalThis.document,oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;let downloaded,clicks=0;
 t.after(()=>{globalThis.fetch=oldFetch;if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;});
 globalThis.fetch=async(url,options)=>{requests.push({url,options});return Response.json(url==='/api/state?export=1'?full:url==='/api/action'?{status:'fixture'}:state);};
 globalThis.document={createElement(tag){assert.equal(tag,'a');return {click(){clicks++;}};}};URL.createObjectURL=blob=>{downloaded=blob;return 'blob:synthetic-download';};URL.revokeObjectURL=()=>{};
 let tree=page.render();find(tree,'button','Configurações').props.onClick();tree=page.render();assert.equal(find(tree,'button','Limpar sinais ignorados').props.disabled,true);
 // The active state has an ignored signal, while the export additionally contains archived detail.
 state.signals=[{...archived,signature:'active-fixture'}];tree=page.render();await find(tree,'button','Exportar experiência completa').props.onClick();tree=page.render();
 assert.equal(clicks,1);assert.deepEqual(JSON.parse(await downloaded.text()),full);assert.equal(requests[0].url,'/api/state?export=1');assert.equal(requests[0].options.cache,'no-store');assert.equal(find(tree,'button','Limpar sinais ignorados').props.disabled,false);
 await find(tree,'button','Limpar sinais ignorados').props.onClick();const cleanup=requests.find(item=>item.url==='/api/action');assert.deepEqual(JSON.parse(cleanup.options.body),{action:'cleanup-ignored',backupFingerprint:fingerprint});assert.equal(find(page.render(),'button','Limpar sinais ignorados').props.disabled,true);
});

test('valorização assinala preço com mais de 180 segundos independentemente do intervalo',()=>{
 const state=fixture();state.config.interval=120;state.market.time=Date.now()-180001;let page=harness(state);assert(text(page.render()).includes('preço anterior'));
 state.market.time=Date.now();page=harness(state);assert(text(page.render()).includes('inclui posição aberta'));
 const tree=page.render();find(tree,'button','Diagnóstico').props.onClick();assert(elements(page.render()).some(node=>node.type.name==='LabDiagnostics'&&node.props.state===state));
});
