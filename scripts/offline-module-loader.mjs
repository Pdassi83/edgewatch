import fs from 'node:fs';
import ts from 'typescript';

const encode=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext})).toString('base64');
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const replace=(source,specifier,url)=>source.replaceAll(`from '${specifier}'`,`from '${url}'`);

/** Node-side loader for the offline commands; mirrors the app modules without bundling or network access. */
function offlinePipelineUrl(){
 const core=encode(read('lib/core.ts'));
 const agents=encode(replace(read('lib/agents.ts'),'./core',core));
 const ledger=encode(replace(read('lib/research-ledger.ts'),'./agents',agents));
 const adapter=encode(replace(replace(read('lib/research-adapter.ts'),'./agents',agents),'./research-ledger',ledger));
 const portfolio=encode(replace(read('lib/reflex-portfolio.ts'),'./research-ledger',ledger));
 const comparison=encode(replace(read('lib/comparison-report.ts'),'./research-ledger',ledger));
 let pipeline=read('lib/offline-pipeline.ts');
 pipeline=replace(pipeline,'./research-adapter',adapter);pipeline=replace(pipeline,'./reflex-portfolio',portfolio);pipeline=replace(pipeline,'./comparison-report',comparison);
 return encode(pipeline);
}
export const loadOfflinePipeline=()=>import(offlinePipelineUrl());
export async function loadResearchExportProjector(){
 let projector=read('lib/research-export-projector.ts');projector=replace(projector,'./offline-pipeline',offlinePipelineUrl());
 return import(encode(projector));
}
