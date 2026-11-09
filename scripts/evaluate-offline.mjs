import fs from 'node:fs/promises';
import {loadOfflinePipeline,loadResearchExportProjector} from './offline-module-loader.mjs';

const MAX_INPUT_BYTES=10*1024*1024,args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Uso: pnpm evaluate:offline <input.json>\nEntrada máxima: 10 MiB; processamento local, sem rede ou persistência.\n');
 process.exit(0);
}
if(args.length!==1){process.stderr.write('EDGEWATCH_E_USAGE: indique exatamente um ficheiro JSON.\n');process.exit(2);}
let bytes;
try{
 const stat=await fs.stat(args[0]);if(!stat.isFile()||stat.size>MAX_INPUT_BYTES)throw Error('size');bytes=await fs.readFile(args[0]);if(bytes.byteLength>MAX_INPUT_BYTES)throw Error('size');
}catch{process.stderr.write('EDGEWATCH_E_INPUT: não foi possível ler uma entrada válida até 10 MiB.\n');process.exit(1);}
let input,sourceProjection;
try{input=JSON.parse(bytes.toString('utf8'));}catch{process.stderr.write('EDGEWATCH_E_JSON: entrada JSON inválida.\n');process.exit(1);}
try{
 if(input?.kind==='edgewatch_offline_projection_result'){const {offlineProjectionForEvaluation}=await loadResearchExportProjector(),projection=offlineProjectionForEvaluation(input);input=projection.input;sourceProjection=projection.projectionManifest;}
 const {runOfflinePipeline}=await loadOfflinePipeline(),result=runOfflinePipeline(input);if(sourceProjection){if(sourceProjection.projectedInputSha256!==result.manifest.canonicalInputSha256)throw Error('projection hash mismatch');result.manifest.sourceProjection=sourceProjection;}process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){
 const safe=error instanceof Error&&(error.message.startsWith('Entrada offline inválida:')||error.message.startsWith('Exportação da branch incompatível:')),message=safe?error.message:'avaliação recusada pelo contrato offline';
 process.stderr.write(`EDGEWATCH_E_EVALUATION: ${message}.\n`);process.exit(1);
}
