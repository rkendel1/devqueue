import { database } from '@/lib/queue-store'
import { authenticateHuman, provisionWorker } from '@/lib/production-auth'
import { ProtocolError } from '@/lib/auth-types'
export async function POST(request: Request) {
 try { authenticateHuman(request); const raw=await request.text();if(Buffer.byteLength(raw)>65536)throw new ProtocolError(413,'request_too_large');const body=JSON.parse(raw); if(typeof body.name!=='string'||typeof body.token!=='string'||!Array.isArray(body.projectIds)||body.projectIds.some((id:unknown)=>typeof id!=='string'))throw new ProtocolError(400,'invalid_worker');return Response.json({data:await provisionWorker(database(),body.name,body.projectIds,body.token)},{status:201,headers:{'Cache-Control':'no-store'}}) }
 catch(e){return Response.json({error:e instanceof ProtocolError?e.message:'worker_creation_unavailable'},{status:e instanceof ProtocolError?e.status:503})}
}
export async function GET(request: Request) {
 try {authenticateHuman(request);return Response.json({data:await database().collection('Worker').find()})}catch(e){return Response.json({error:'worker_metadata_unavailable'},{status:503})}
}
