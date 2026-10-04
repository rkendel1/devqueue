import { authenticateHuman } from '@/lib/production-auth'
import { verifyAuthority } from '@/lib/readiness'
import { ProtocolError } from '@/lib/auth-types'
export async function GET(request:Request){try{authenticateHuman(request);return Response.json(await verifyAuthority(),{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({ready:false,error:e instanceof ProtocolError?e.message:'authority_unavailable'},{status:e instanceof ProtocolError?e.status:503})}}
