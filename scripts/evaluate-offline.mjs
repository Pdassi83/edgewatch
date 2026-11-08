import fs from 'node:fs/promises';
import {loadOfflinePipeline} from './offline-module-loader.mjs';

const path=process.argv[2];
if(!path){console.error('Uso: pnpm evaluate:offline <input.json>');process.exit(2);}
try{
 const input=JSON.parse(await fs.readFile(path,'utf8')),{runOfflinePipeline}=await loadOfflinePipeline();
 process.stdout.write(JSON.stringify(runOfflinePipeline(input),null,2)+'\n');
}catch(error){console.error('Avaliação offline falhou: '+(error instanceof Error?error.message:'erro desconhecido'));process.exit(1);}
