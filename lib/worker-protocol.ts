import { createHash } from 'node:crypto'
import type { StateFirstDB } from '@feltdb/core'
import { selectNext } from './queue-selection'
import { ProtocolError, type WorkerPrincipal } from './worker-auth'
import type { PR, Project, Decision } from './queue-store'
export type Session = { id: string; projectId: string; prId: string; ownerId: string; workerType: string; workspacePath: string; status: 'claimed'|'running'|'waiting'|'completed'|'failed'; startedAt: string; updatedAt: string; lastHeartbeatAt: string; sequence: number; taskPacket: Record<string, unknown>; currentQuestion?: string; resultEvidence?: Record<string, unknown>; completionRequestedAt?: string }
type Receipt = { id: string; ownerId: string; input: string; response: unknown }
const active = ['claimed', 'running', 'waiting']
export class WorkerProtocol {
  constructor(private db: StateFirstDB) {}
  async claim(principal: WorkerPrincipal, input: { projectId: string; prId?: string; workerType: string; workspacePath: string }, requestId: string) {
    if (!principal.projects.includes(input.projectId)) throw new ProtocolError(403, 'project_forbidden')
    return this.commit(principal, 'claim', requestId, input, async () => {
      const basis = await this.db.readBasis({ records: [{ collection: 'Project', id: input.projectId }], predicates: ['PR','WorkerSession'].map(collection => ({ collection, where: [{ field: 'projectId', eq: input.projectId }] })) })
      const project = await this.db.collection<Project>('Project').get(input.projectId)
      if (!project) throw new ProtocolError(404, 'project_not_found')
      const pr = selectNext(await this.db.collection<PR>('PR').find({ projectId: input.projectId }))
      if (!pr) throw new ProtocolError(409, 'no_executable_pr')
      if (input.prId && input.prId !== pr.id) throw new ProtocolError(409, 'not_next_executable_pr')
      const sessions = await this.db.collection<Session>('WorkerSession').find({ projectId: input.projectId })
      if (sessions.some(s => active.includes(s.status) || (s.status as string) === 'idle')) throw new ProtocolError(409, 'active_session_conflict')
      const decisionBasis = await this.db.readBasis({ predicates: [{ collection: 'Decision', where: [{ field: 'prId', eq: pr.id }] }] })
      const decisions = await this.db.collection<Decision>('Decision').find({ prId: pr.id })
      decisions.sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      const timestamp = new Date().toISOString(), sessionId = crypto.randomUUID()
      const taskPacket = { taskId: `task:${project.id}:${pr.id}`, sessionId, project, pr, previousDecisions: decisions, workerContract: { inspectBeforeChanging: true, runAcceptanceCriteria: true, preserveUnrelatedChanges: true, reportQuestions: true, reportResult: true } }
      const session: Session = { id: sessionId, projectId: project.id, prId: pr.id, ownerId: principal.id, workerType: input.workerType, workspacePath: input.workspacePath, status: 'claimed', startedAt: timestamp, updatedAt: timestamp, lastHeartbeatAt: timestamp, sequence: 0, taskPacket }
      return { basis: [basis, decisionBasis], response: { session, taskPacket }, operations: [{ collection: 'WorkerSession', id: sessionId, value: session, requireAbsent: true }, { collection: 'PR', id: pr.id, value: { ...pr, status: 'running', workerSessionId: sessionId, updatedAt: timestamp } }] }
    })
  }
  async read(principal: WorkerPrincipal, id: string) {
    const session = await this.db.collection<Session>('WorkerSession').get(id)
    if (!session) throw new ProtocolError(404, 'session_not_found')
    if (session.ownerId !== principal.id || !principal.projects.includes(session.projectId)) throw new ProtocolError(403, 'session_forbidden')
    return session
  }
  async act(principal: WorkerPrincipal, id: string, action: string, body: Record<string, unknown>, requestId: string) {
    // Ownership is checked even when replaying a previously committed response.
    await this.read(principal, id)
    return this.commit(principal, `${id}:${action}`, requestId, body, async () => {
      const original = await this.read(principal, id)
      const basis = await this.db.readBasis({ records: [{ collection: 'WorkerSession', id }, { collection: 'PR', id: original.prId }] })
      const session = await this.read(principal, id)
      if (!active.includes(session.status)) throw new ProtocolError(409, 'session_terminal')
      const timestamp = new Date().toISOString()
      let message = typeof body.message === 'string' ? body.message : ''
      let type: string | undefined
      const changes: Partial<Session> = { updatedAt: timestamp }
      const pr = await this.db.collection<PR>('PR').get(session.prId)
      if (!pr || pr.workerSessionId !== id) throw new ProtocolError(409, 'session_assignment_conflict')
      let prStatus: string | undefined
      if (action === 'heartbeat') changes.lastHeartbeatAt = timestamp
      else if (action === 'events') {
        type = String(body.type)
        if (!['started','output','progress','error'].includes(type) || !message.trim()) throw new ProtocolError(400, 'invalid_event_use_dedicated_question_or_complete_endpoint')
        if (session.status === 'waiting' && type !== 'error') throw new ProtocolError(409, 'session_waiting')
        if (type === 'started') { if (session.status !== 'claimed') throw new ProtocolError(409, 'invalid_transition'); changes.status = 'running' }
        else if (session.status !== 'running') throw new ProtocolError(409, 'session_not_running')
      } else if (action === 'question') {
        if (session.status !== 'running' || !message.trim()) throw new ProtocolError(409, 'invalid_question_transition')
        type = 'question'; changes.status = 'waiting'; changes.currentQuestion = message; prStatus = 'waiting'
      } else if (action === 'result') {
        if (session.status !== 'running' || typeof body.result !== 'string') throw new ProtocolError(409, 'invalid_result')
        changes.resultEvidence = body; type = 'progress'; message = 'Worker result reported (not acceptance)'
      } else if (action === 'complete') {
        if (session.status !== 'running' || !session.resultEvidence || session.currentQuestion) throw new ProtocolError(409, 'completion_not_eligible')
        changes.completionRequestedAt = timestamp; type = 'completed'; message = 'Worker requested completion; acceptance enforcement pending'
      } else if (action === 'fail') {
        if (!['running','waiting'].includes(session.status) || !message.trim()) throw new ProtocolError(409, 'invalid_failure_transition')
        changes.status = 'failed'; prStatus = 'failed'; type = 'error'
      } else throw new ProtocolError(404, 'unknown_operation')
      const sequence = session.sequence + (type ? 1 : 0)
      const updated = { ...session, ...changes, sequence }
      const operations: { collection: string; id: string; value: Record<string, unknown>; requireAbsent?: boolean }[] = [{ collection: 'WorkerSession', id, value: updated }]
      if (type) operations.push({ collection: 'WorkerEvent', id: `${id}-${sequence}`, requireAbsent: true, value: { id: `${id}-${sequence}`, sessionId: id, sequence, type, message, ...(body.metadata ? { metadata: body.metadata } : {}), ...(action === 'result' ? { metadata: body } : {}), ...(action === 'complete' ? { metadata: { acceptance: 'pending', workerRequestedCompletion: true } } : {}), createdAt: timestamp } })
      if (prStatus) operations.push({ collection: 'PR', id: pr.id, value: { ...pr, status: prStatus, ...(action === 'question' ? { currentQuestion: message } : {}), updatedAt: timestamp } })
      return { basis: [basis], operations, response: action === 'complete' ? { status: 'completion_pending_acceptance', session: updated } : { session: updated } }
    })
  }
  private async commit(principal: WorkerPrincipal, scope: string, requestId: string, input: unknown, build: () => Promise<{ basis: Awaited<ReturnType<StateFirstDB['readBasis']>>[]; response: unknown; operations: { collection: string; id: string; value: Record<string, unknown>; requireAbsent?: boolean }[] }>) {
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId)) throw new ProtocolError(400, 'idempotency_key_required')
    const id = createHash('sha256').update(JSON.stringify([principal.id, scope, requestId])).digest('hex'), encoded = JSON.stringify(input)
    const receipt = await this.db.collection<Receipt>('WorkerRequest').get(id)
    if (receipt) { if (receipt.input !== encoded) throw new ProtocolError(409, 'idempotency_key_reused'); return receipt.response }
    const change = await build()
    try { await this.db.transaction({ transactionId: id, fences: change.basis, operations: [...change.operations, { collection: 'WorkerRequest', id, requireAbsent: true, value: { id, ownerId: principal.id, input: encoded, response: change.response } }] }) }
    catch (error) {
      const replay = await this.db.collection<Receipt>('WorkerRequest').get(id)
      if (replay && replay.input === encoded) return replay.response
      throw new ProtocolError(409, 'concurrent_change_retry_with_same_key')
    }
    // Always return the winning durable receipt, including transaction replays.
    return (await this.db.collection<Receipt>('WorkerRequest').get(id))!.response
  }
}
