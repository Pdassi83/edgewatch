import fs from 'node:fs/promises';
import {loadResearchExportProjector} from './offline-module-loader.mjs';

const MAX_INPUT_BYTES=10*1024*1024,args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help'){
 process.stdout.write('Uso: pnpm project:offline <export.json> <dataset-id> <capital-eur> <percentagem-por-operação>\nProjeção local da exportação de investigação v2 reconciliada; não aceita estado bruto v10 nem backups D1.\n');process.exit(0);
}
if(args.length!==4){process.stderr.write('EDGEWATCH_E_USAGE: indique exportação, dataset, capital e percentagem.\n');process.exit(2);}
let bytes;
try{const stat=await fs.stat(args[0]);if(!stat.isFile()||stat.size>MAX_INPUT_BYTES)throw Error('size');bytes=await fs.readFile(args[0]);if(bytes.byteLength>MAX_INPUT_BYTES)throw Error('size');}
catch{process.stderr.write('EDGEWATCH_E_INPUT: não foi possível ler uma exportação válida até 10 MiB.\n');process.exit(1);}
let raw;
try{raw=JSON.parse(bytes.toString('utf8'));}catch{process.stderr.write('EDGEWATCH_E_JSON: exportação JSON inválida.\n');process.exit(1);}
try{
 const {projectKnownBranchResearchExport}=await loadResearchExportProjector(),result=projectKnownBranchResearchExport(raw,{datasetId:args[1],portfolioConfig:{initialCapitalEur:Number(args[2]),perTradePct:Number(args[3])}});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){
 const safe=error instanceof Error&&(error.message.startsWith('Entrada offline inválida:')||error.message.startsWith('Exportação da branch incompatível:')),message=safe?error.message:'projeção recusada pelo contrato conhecido';
 process.stderr.write(`EDGEWATCH_E_PROJECTION: ${message}.\n`);process.exit(1);
}
