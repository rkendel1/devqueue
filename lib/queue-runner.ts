import { database, buildTaskPacket, getProject, nextExecutablePR, type WorkerSession } from '@/lib/queue-store'

// The control plane admits work; an external execution provider consumes the packet.
export async function runNext(projectId: string) {
  const db = database()
  const basis = await db.readBasis({
    records: [{ collection: 'Project', id: projectId }],
    predicates: ['PR', 'WorkerSession', 'Decision'].map(collection => ({ collection, where: collection === 'Decision' ? [] : [{ field: 'projectId', eq: projectId }] })),
  })
  const project = await getProject(projectId)
  if (!project) throw new Error('Project not found')
  const sessions = await db.collection<WorkerSession>('WorkerSession').find({ projectId })
  if (sessions.some(session => ['running', 'waiting', 'idle'].includes(session.status))) throw new Error('Project already has an active worker session')
  const pr = await nextExecutablePR(projectId)
  if (!pr) return null
  const taskPacket = await buildTaskPacket(projectId, pr.id)
  if (!taskPacket) throw new Error('Unable to build task packet')
  const timestamp = new Date().toISOString()
  const session: WorkerSession = { id: crypto.randomUUID(), projectId, prId: pr.id, workerType: 'unassigned', workspacePath: project.repositoryPath, status: 'idle', startedAt: timestamp, updatedAt: timestamp }
  await db.transaction({ fences: [basis], operations: [
    { collection: 'WorkerSession', id: session.id, value: session, requireAbsent: true },
    { collection: 'PR', id: pr.id, value: { ...pr, status: 'running', workerSessionId: session.id, updatedAt: timestamp } },
    { collection: 'WorkerEvent', id: crypto.randomUUID(), requireAbsent: true, value: { sessionId: session.id, type: 'started', message: `TaskPacket admitted for PR #${pr.number}; awaiting execution provider`, createdAt: timestamp } },
  ] })
  return { session, taskPacket }
}
