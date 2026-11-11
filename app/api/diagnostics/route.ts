import {readState} from '@/lib/store';
import {diagnostics,researchExport} from '@/lib/observability';

export const dynamic='force-dynamic';
// Same owner-private Sites dispatch as /api/state; never call providers here.
export async function GET(req:Request){
 try{
  const s=await readState(),download=new URL(req.url).searchParams.get('export')==='1';
  const headers:Record<string,string>={'cache-control':'no-store'};
  if(download)headers['content-disposition']='attachment; filename="edgewatch-research.json"';
  return Response.json(download?researchExport(s):diagnostics(s),{headers});
 }catch{return Response.json({error:'Diagnóstico indisponível'},{status:503,headers:{'cache-control':'no-store'}});}
}
