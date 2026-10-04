import { timingSafeEqual } from 'node:crypto'
import { requireLocal } from './local-boundary'
import { ProtocolError,type WorkerPrincipal } from './auth-types'
export { ProtocolError,type WorkerPrincipal } from './auth-types'
export interface WorkerAuthenticator {authenticate(request:Request):Promise<WorkerPrincipal>}
export const workerAuthenticator:WorkerAuthenticator={async authenticate(request){
 requireLocal(request)
 const expected=process.env.DEV_QUEUE_WORKER_TOKEN
 if(!expected||expected.length<32)throw new ProtocolError(503,'local_worker_token_required')
 const token=/^Bearer ([A-Za-z0-9_-]+)$/.exec(request.headers.get('authorization')??'')?.[1]??''
 if(Buffer.byteLength(token)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))throw new ProtocolError(401,'unauthenticated')
 // Single local worker identity. Project existence and next selection are server verified.
 const {listProjects}=await import('./queue-store')
 return {id:'local-worker',projects:(await listProjects()).map(p=>p.id)}
}}
