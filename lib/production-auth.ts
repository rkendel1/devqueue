import { createHash, timingSafeEqual } from 'node:crypto'
import type { StateFirstDB } from '@feltdb/core'
import { ProtocolError, type WorkerPrincipal } from './auth-types'
export type Worker = { id: string; name: string; status: string; createdAt: string }
export type Grant = { id: string; workerId: string; projectId: string; permissions: string[]; createdAt: string }
export type Credential = { id: string; workerId: string; digest: string; createdAt: string; revokedAt?: string }
export const digest = (token: string) => createHash('sha256').update(token).digest('hex')
export function bearer(request: Request) {
 const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(request.headers.get('authorization') ?? '')
 if (!match) throw new ProtocolError(401, 'unauthenticated')
 return match[1]
}
export async function authenticateDurableWorker(db: StateFirstDB, token: string): Promise<WorkerPrincipal> {
 const value = digest(token)
 const credential = await db.collection<Credential>('WorkerCredential').get(value)
 if (!credential || credential.revokedAt) throw new ProtocolError(401, 'unauthenticated')
 const worker = await db.collection<Worker>('Worker').get(credential.workerId)
 if (!worker || worker.status !== 'active') throw new ProtocolError(401, 'unauthenticated')
 const grants = await db.collection<Grant>('WorkerProjectGrant').find({ workerId: worker.id })
 return { id: worker.id, projects: grants.filter(g => g.permissions.includes('execute')).map(g => g.projectId) }
}
// Initial deployment administrator boundary, not a worker identity or database key.
export function authenticateHuman(request: Request) {
 if (process.env.NODE_ENV !== 'production' && process.env.DEV_QUEUE_LOCAL_AUTH !== 'enabled') throw new ProtocolError(503, 'human_authentication_unavailable')
 const token = bearer(request)
 const expected = process.env.NODE_ENV === 'production' ? process.env.DEV_QUEUE_HUMAN_TOKEN_SHA256 : process.env.DEV_QUEUE_LOCAL_HUMAN_TOKEN ? digest(process.env.DEV_QUEUE_LOCAL_HUMAN_TOKEN) : undefined
 if (!expected || !/^[a-f0-9]{64}$/.test(expected) || expected === digest(process.env.FELTDB_TOKEN ?? '')) throw new ProtocolError(process.env.NODE_ENV === 'production' ? 503 : 403, 'human_authentication_unavailable')
 const supplied = digest(token)
 if (!timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) throw new ProtocolError(403, 'human_capability_required')
 return { id: 'deployment-operator', administrator: true }
}
export async function provisionWorker(db: StateFirstDB, name: string, projectIds: string[], token: string) {
 if (!name.trim() || !projectIds.length || new Set(projectIds).size !== projectIds.length) throw new ProtocolError(400, 'invalid_worker')
 for (const projectId of projectIds) if (!await db.collection('Project').get(projectId)) throw new ProtocolError(404, 'project_not_found')
 if (!/^[A-Za-z0-9_-]{43,256}$/.test(token) || token === process.env.FELTDB_TOKEN || digest(token) === process.env.DEV_QUEUE_HUMAN_TOKEN_SHA256 || token === process.env.DEV_QUEUE_LOCAL_HUMAN_TOKEN) throw new ProtocolError(400,'invalid_dedicated_worker_token')
 const id = crypto.randomUUID(), timestamp = new Date().toISOString(), hash = digest(token)
 const worker: Worker = { id, name, status: 'active', createdAt: timestamp }
 await db.transaction({ operations: [
  { collection: 'Worker', id, value: worker, requireAbsent: true },
  { collection: 'WorkerCredential', id: hash, requireAbsent: true, value: { id: hash, workerId: id, digest: hash, createdAt: timestamp } },
  ...projectIds.map(projectId => { const grantId=crypto.randomUUID(); return { collection: 'WorkerProjectGrant', id: grantId, requireAbsent: true, value: { id: grantId, workerId: id, projectId, permissions: ['execute'], createdAt: timestamp } } }),
 ] })
 return { worker } // Operator generated token is never returned or persisted plaintext.
}
