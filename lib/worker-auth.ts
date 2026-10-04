import { timingSafeEqual } from 'node:crypto'
export type WorkerPrincipal = { id: string; projects: string[] }
export interface WorkerAuthenticator { authenticate(request: Request): Promise<WorkerPrincipal> }
export class ProtocolError extends Error { constructor(public status: number, message: string) { super(message) } }
// Explicit local authenticated mode only. Production requires a trusted identity adapter.
export const workerAuthenticator: WorkerAuthenticator = {
  async authenticate(request) {
    if (process.env.NODE_ENV === 'production' || process.env.DEV_QUEUE_LOCAL_AUTH !== 'enabled') throw new ProtocolError(503, 'worker_authentication_unavailable')
    let identities: { id: string; token: string; projects: string[] }[]
    try { identities = JSON.parse(process.env.DEV_QUEUE_LOCAL_WORKERS ?? '[]') } catch { throw new ProtocolError(503, 'worker_authentication_unavailable') }
    if (!Array.isArray(identities) || identities.some(i => !i || typeof i.id !== 'string' || !Array.isArray(i.projects) || typeof i.token !== 'string' || i.token === process.env.DEV_QUEUE_LOCAL_HUMAN_TOKEN)) throw new ProtocolError(503, 'invalid_worker_identity_configuration')
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
    const identity = identities.find(i => i.token?.length >= 32 && Buffer.byteLength(i.token) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(i.token), Buffer.from(token)))
    if (!identity) throw new ProtocolError(401, 'unauthenticated')
    return { id: identity.id, projects: identity.projects }
  },
}
