import {readState,readExport} from '@/lib/store';
export const dynamic='force-dynamic';
// Owner-private Sites dispatch is the shared lab's authentication boundary.
export async function GET(req:Request){try{return Response.json(await (new URL(req.url).searchParams.get('export')==='1'?readExport():readState()),{headers:{'cache-control':'no-store'}});}catch{return Response.json({error:'Base de dados indisponível'},{status:503});}}
