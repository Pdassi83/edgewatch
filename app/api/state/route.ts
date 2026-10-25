import {readState} from '@/lib/store';
export const dynamic='force-dynamic';
// Owner-private Sites dispatch is the shared lab's authentication boundary.
export async function GET(){try{return Response.json(await readState(),{headers:{'cache-control':'no-store'}});}catch{return Response.json({error:'Base de dados indisponível'},{status:503});}}
