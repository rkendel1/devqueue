import { selectNext } from './queue-selection'
import { createFeltDB } from '@feltdb/core'

export type QueueStatus = 'running' | 'queued' | 'waiting' | 'done' | 'failed'
export type Project = { id: string; name: string; goal: string; repositoryPath: string; defaultBranch: string; createdAt: string; updatedAt: string }
export type PR = { id: string; projectId: string; number: number; title: string; objective: string; specification: string; acceptanceCriteria: string[]; constraints: string[]; dependencies: string[]; status: QueueStatus; priority: number; position: number; branch?: string; workerSessionId?: string; currentQuestion?: string; result?: string; createdAt: string; updatedAt: string }
export type QueueItem = Omit<PR, 'id'> & { id: number; dependency?: string; elapsed?: string; worker?: string }
export type WorkerStatus = 'disconnected' | 'idle' | 'running' | 'waiting' | 'completed' | 'failed'
export type WorkerSession = { id: string; projectId: string; prId: string; workerType: string; workspacePath: string; status: WorkerStatus; startedAt: string; updatedAt: string; completedAt?: string }
export type WorkerEvent = { id: string; sessionId: string; type: 'started'|'output'|'progress'|'question'|'error'|'completed'; message: string; metadata?: Record<string, unknown>; createdAt: string }
export type Decision = { id: string; sessionId: string; prId: string; question: string; answer: string; recommendation?: string; confidence?: number; requiresHumanApproval: boolean; createdAt: string }

let instance: ReturnType<typeof createFeltDB> | undefined
export function database() {
  if (!instance) {
    const url = process.env.FELTDB_URL
    const token = process.env.FELTDB_TOKEN
    if (!url || !token) throw new Error('Configure FELTDB_URL and server-only FELTDB_TOKEN; no ephemeral fallback is permitted')
    instance = createFeltDB({ namespace: 'dev-queue', server: { url, token, applicationId: process.env.FELTDB_APPLICATION_ID, environment: process.env.FELTDB_ENVIRONMENT ?? 'development' } })
  }
  return instance
}
const collections: Record<string, string> = { projects: 'Project', prs: 'PR', worker_sessions: 'WorkerSession', worker_events: 'WorkerEvent', decisions: 'Decision' }
const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()
async function put<T>(collection: string, value: T & { id: string }) {
  const table = database().collection<T & { id: string }>(collections[collection])
  if (await table.get(value.id)) await table.update(value.id, value)
  else await table.insert(value, value.id)
  return value
}
async function remove(collection: string, id: string) { await database().collection(collections[collection]).delete(id) }
async function records<T>(collection: string): Promise<T[]> { return database().collection<T>(collections[collection]).find() }
async function get<T>(collection: string, itemId: string): Promise<T | null> { return database().collection<T>(collections[collection]).get(itemId) }

export async function listProjects() { return (await records<Project>('projects')).sort((a,b) => a.createdAt.localeCompare(b.createdAt)) }
export async function getProject(projectId: string) { return get<Project>('projects', projectId) }
export async function createProject(input: Omit<Project, 'id'|'createdAt'|'updatedAt'> & { id?: string }) { const timestamp = now(); return put('projects', { ...input, id: input.id ?? id(), createdAt: timestamp, updatedAt: timestamp }) }
export async function updateProject(projectId: string, patch: Partial<Omit<Project, 'id'|'createdAt'>>) { const existing = (await getProject(projectId)); if (!existing) return null; return put('projects', { ...existing, ...patch, id: existing.id, updatedAt: now() }) }
export async function deleteProject(projectId: string) { if (!(await getProject(projectId))) return false; await Promise.all((await listPRs(projectId)).map(p => remove('prs', p.id))); (await remove('projects', projectId)); return true }

export async function listPRs(projectId: string) { return (await records<PR>('prs')).filter((p) => p.projectId === projectId).sort((a,b) => a.priority - b.priority || a.number - b.number) }
export async function getPR(prId: string) { return get<PR>('prs', prId) }
export async function createPR(input: Omit<PR, 'id'|'createdAt'|'updatedAt'|'position'> & { position?: number }) { const timestamp = now(); const existing = (await listPRs(input.projectId)); return put('prs', { ...input, id: id(), position: input.position ?? existing.length, createdAt: timestamp, updatedAt: timestamp }) }
export async function updatePR(prId: string, patch: Partial<Omit<PR, 'id'|'createdAt'>>) { const existing = (await getPR(prId)); if (!existing) return null; if (patch.status && patch.status !== existing.status) throw new Error('Execution state is owned by the runner and evidence protocol'); return put('prs', { ...existing, ...patch, id: existing.id, updatedAt: now() }) }
export async function deletePR(prId: string) { const existing = await getPR(prId); if (!existing) return false; if (['running', 'waiting'].includes(existing.status)) throw new Error('Cannot delete active work'); (await remove('prs', prId)); return true }
export async function reorderPRs(projectId: string, orderedIds: string[]) { const basis = await database().readBasis({ predicates: [{ collection: 'PR', where: [{ field: 'projectId', eq: projectId }] }] }); const all = (await listPRs(projectId)); if (orderedIds.length !== all.length || new Set(orderedIds).size !== all.length || orderedIds.some((x) => !all.some((p) => p.id === x))) return false; await database().transaction({ fences: [basis], operations: orderedIds.map((prId, priority) => ({ collection: 'PR', id: prId, value: { ...all.find(p => p.id === prId)!, priority, updatedAt: now() } })) }); return true }

export async function listQueue(): Promise<QueueItem[]> { return (await listPRs('default-project')).map((p) => ({ ...p, id: p.number, dependency: p.dependencies[0], branch: p.branch ?? `dev-queue/pr-${p.number}` })) }
export async function createQueueItem(input: { title: string; objective: string; status?: QueueStatus; dependency?: string; branch?: string }) {
  const db = database()
  const basis = await db.readBasis({ records: [{ collection: 'Project', id: 'default-project' }], predicates: [{ collection: 'PR', where: [{ field: 'projectId', eq: 'default-project' }] }] })
  const project = await getProject('default-project')
  const all = await listPRs('default-project')
  const timestamp = now()
  const pr: PR = { id: id(), projectId: 'default-project', number: Math.max(0, ...all.map(p => p.number)) + 1, title: input.title, objective: input.objective, specification: input.objective, acceptanceCriteria: [], constraints: [], dependencies: input.dependency ? [input.dependency] : [], status: 'queued', priority: Math.max(-1, ...all.map(p => p.priority)) + 1, position: all.length, ...(input.branch ? { branch: input.branch } : {}), createdAt: timestamp, updatedAt: timestamp }
  await db.transaction({ fences: [basis], operations: [
    ...(!project ? [{ collection: 'Project', id: 'default-project', requireAbsent: true, value: { id: 'default-project', name: 'Dev Queue', goal: 'Execute queued work reliably', repositoryPath: process.env.DEV_QUEUE_REPOSITORY_PATH ?? process.cwd(), defaultBranch: 'main', createdAt: timestamp, updatedAt: timestamp } }] : []),
    { collection: 'PR', id: pr.id, requireAbsent: true, value: pr },
  ] })
  return { ...pr, id: pr.number }
}
async function getQueuePR(number: number) { return (await listPRs('default-project')).find((pr) => pr.number === number) ?? null }
export async function updateQueueItem(number: number, patch: Partial<QueueItem>) { const item = (await getQueuePR(number)); return item ? (await updatePR(item.id, patch)) : null }
export async function deleteQueueItem(number: number) { const item = (await getQueuePR(number)); return item ? deletePR(item.id) : false }
export async function reorderQueue(number: number, direction: 'up'|'down') { const items = (await listPRs('default-project')); const index = items.findIndex((x) => x.number === number); const target = index + (direction === 'up' ? -1 : 1); if (index < 0 || target < 0 || target >= items.length) return null; const ids = items.map((item) => item.id); [ids[index], ids[target]] = [ids[target], ids[index]]; (await reorderPRs('default-project', ids)); return (await listQueue()) }
export async function closeQueueStore() { instance?.close() }

export async function nextExecutablePR(projectId: string) { return selectNext(await listPRs(projectId)) }
export async function createSession(input: Omit<WorkerSession, 'id'|'startedAt'|'updatedAt'>) { const timestamp = now(); return put('worker_sessions', { ...input, id: id(), startedAt: timestamp, updatedAt: timestamp }) }
export async function listDecisions(prId: string) { return (await records<Decision>('decisions')).filter((d) => d.prId === prId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)) }
export async function addEvent(input: Omit<WorkerEvent, 'id'|'createdAt'>) { return put('worker_events', { ...input, id: id(), createdAt: now() }) }
export async function buildTaskPacket(projectId: string, prId: string) { const project = (await getProject(projectId)); const pr = (await getPR(prId)); if (!project || !pr || pr.projectId !== projectId) return null; return { taskId: `task:${projectId}:${prId}`, projectId, prId, project: { name: project.name, goal: project.goal, repositoryPath: project.repositoryPath, defaultBranch: project.defaultBranch }, pr: { number: pr.number, title: pr.title, objective: pr.objective, specification: pr.specification, acceptanceCriteria: pr.acceptanceCriteria, constraints: pr.constraints, dependencies: pr.dependencies }, previousDecisions: (await listDecisions(prId)), workerContract: { inspectBeforeChanging: true, runAcceptanceCriteria: true, preserveUnrelatedChanges: true, reportQuestions: true, reportResult: true } } }
