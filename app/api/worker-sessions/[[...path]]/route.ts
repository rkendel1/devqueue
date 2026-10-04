import { database } from '@/lib/queue-store'
import { workerAuthenticator, ProtocolError } from '@/lib/worker-auth'
import { WorkerProtocol } from '@/lib/worker-protocol'
type Context = { params: Promise<{ path?: string[] }> }
async function handle(request: Request, context: Context) {
  try {
    const principal = await workerAuthenticator.authenticate(request)
    const path = (await context.params).path ?? []
    const protocol = new WorkerProtocol(database())
    if (request.method === 'GET' && path.length === 1) { const session = await protocol.read(principal, path[0]); const activity = ['completed','failed'].includes(session.status) ? session.status : Date.now() - Date.parse(session.lastHeartbeatAt) > 60000 ? 'stale' : 'active'; return Response.json({ data: { ...session, activity }, staleAfterMs: 60000 }) }
    if (request.method !== 'POST') throw new ProtocolError(405, 'method_not_allowed')
    const raw = await request.text()
    if (Buffer.byteLength(raw) > 65536) throw new ProtocolError(413, 'request_too_large')
    const body = await Promise.resolve().then(() => JSON.parse(raw)).catch(() => { throw new ProtocolError(400, 'invalid_json') })
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ProtocolError(400, 'invalid_body')
    if ('metadata' in body && (!body.metadata || typeof body.metadata !== 'object' || Array.isArray(body.metadata))) throw new ProtocolError(400, 'invalid_metadata')
    if ('tests' in body && (!Array.isArray(body.tests) || body.tests.some((test: unknown) => !test || typeof test !== 'object' || Array.isArray(test)))) throw new ProtocolError(400, 'invalid_tests')
    if ('git' in body && (!body.git || typeof body.git !== 'object' || Array.isArray(body.git))) throw new ProtocolError(400, 'invalid_git_evidence')
    const key = request.headers.get('idempotency-key') ?? ''
    if (!path.length || (path.length === 1 && path[0] === 'claim-next')) {
      for (const field of ['projectId','workerType','workspacePath']) if (typeof body[field] !== 'string' || !body[field].trim() || body[field].length > 4096) throw new ProtocolError(400, `invalid_${field}`)
      if (!path.length && (typeof body.prId !== 'string' || !body.prId)) throw new ProtocolError(400, 'prId_required')
      const input = { projectId: body.projectId, workerType: body.workerType, workspacePath: body.workspacePath, ...(!path.length ? { prId: body.prId } : {}) }
      return Response.json({ data: await protocol.claim(principal, input, key) }, { status: 201 })
    }
    if (path.length === 2) return Response.json({ data: await protocol.act(principal, path[0], path[1], body, key) })
    throw new ProtocolError(404, 'not_found')
  } catch (error) {
    return Response.json({ error: error instanceof ProtocolError ? error.message : 'worker_authority_unavailable' }, { status: error instanceof ProtocolError ? error.status : 503 })
  }
}
export const GET = handle
export const POST = handle
