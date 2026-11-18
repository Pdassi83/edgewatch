import {readState} from '@/lib/store';
import {brainEvidence,diagnostics,researchExport} from '@/lib/observability';

export const dynamic='force-dynamic';
// Same owner-private Sites dispatch as /api/state; never call providers here.
export async function GET(req:Request){
 try{
  const s=await readState(),params=new URL(req.url).searchParams;
  const download=params.get('export')==='1';
  const brain=params.get('brain')==='1';
  const headers:Record<string,string>={'cache-control':'no-store'};
  if(download)headers['content-disposition']='attachment; filename="edgewatch-research.json"';
  return Response.json(download?researchExport(s):brain?brainEvidence(s):diagnostics(s),{headers});
 }catch{return Response.json({error:'Diagnóstico indisponível'},{status:503,headers:{'cache-control':'no-store'}});}
}
