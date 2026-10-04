import { FileJsDb } from '@feltdb/core'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export type QueueStatus = 'running' | 'queued' | 'waiting' | 'done' | 'failed'
export type Project = { id: string; name: string; goal: string; repositoryPath: string; defaultBranch: string; createdAt: string; updatedAt: string }
export type PR = { id: string; projectId: string; number: number; title: string; objective: string; specification: string; acceptanceCriteria: string[]; constraints: string[]; dependencies: string[]; status: QueueStatus; priority: number; position: number; branch?: string; workerSessionId?: string; currentQuestion?: string; result?: string; createdAt: string; updatedAt: string }
export type QueueItem = Omit<PR, 'id'> & { id: number; dependency?: string; elapsed?: string; worker?: string }
export type WorkerStatus = 'disconnected' | 'idle' | 'running' | 'waiting' | 'completed' | 'failed'
export type WorkerSession = { id: string; projectId: string; prId: string; workerType: string; workspacePath: string; status: WorkerStatus; startedAt: string; updatedAt: string; completedAt?: string }
export type WorkerEvent = { id: string; sessionId: string; type: 'started'|'output'|'progress'|'question'|'error'|'completed'; message: string; metadata?: Record<string, unknown>; createdAt: string }
export type Decision = { id: string; sessionId: string; prId: string; question: string; answer: string; recommendation?: string; confidence?: number; requiresHumanApproval: boolean; createdAt: string }

const root = path.join(process.cwd(), '.dev-queue', 'data')
mkdirSync(root, { recursive: true })
const db = new FileJsDb(path.join(root, 'queue'))
const now = () => new Date().toISOString()
const key = (collection: string, id: string) => `${collection}:${id}`
const id = () => crypto.randomUUID()
function put<T>(collection: string, value: T & { id: string }) { const result = db.insert(key(collection, value.id), JSON.stringify(value)); if (!result.success) db.update(key(collection, value.id), JSON.stringify(value)); return value }
function remove(collection: string, id: string) { db.delete(key(collection, id)) }
function records<T>(collection: string): T[] { const latest = new Map<string, { type: string; value?: string }>(); for (const event of db.audit_events()) if (event.collection === 'default' && event.key.startsWith(`${collection}:`)) latest.set(event.key, { type: event.type, value: typeof event.value === 'string' ? event.value : undefined }); return [...latest.values()].filter((x) => x.type === 'put' && x.value).map((x) => JSON.parse(x.value!) as T) }
function get<T>(collection: string, itemId: string): T | null { const result = db.get(key(collection, itemId)); return result.success && result.data ? JSON.parse(result.data) as T : null }

export function listProjects() { return records<Project>('projects').sort((a,b) => a.createdAt.localeCompare(b.createdAt)) }
export function getProject(projectId: string) { return get<Project>('projects', projectId) }
export function createProject(input: Omit<Project, 'id'|'createdAt'|'updatedAt'> & { id?: string }) { const timestamp = now(); return put('projects', { ...input, id: input.id ?? id(), createdAt: timestamp, updatedAt: timestamp }) }
export function updateProject(projectId: string, patch: Partial<Omit<Project, 'id'|'createdAt'>>) { const existing = getProject(projectId); if (!existing) return null; return put('projects', { ...existing, ...patch, id: existing.id, updatedAt: now() }) }
export function deleteProject(projectId: string) { if (!getProject(projectId)) return false; records<PR>('prs').filter((p) => p.projectId === projectId).forEach((p) => remove('prs', p.id)); remove('projects', projectId); return true }

export function listPRs(projectId: string) { return records<PR>('prs').filter((p) => p.projectId === projectId).sort((a,b) => a.position - b.position || a.priority - b.priority || a.number - b.number) }
export function getPR(prId: string) { return get<PR>('prs', prId) }
export function createPR(input: Omit<PR, 'id'|'createdAt'|'updatedAt'|'position'> & { position?: number }) { const timestamp = now(); const existing = listPRs(input.projectId); return put('prs', { ...input, id: id(), position: input.position ?? existing.length, createdAt: timestamp, updatedAt: timestamp }) }
export function updatePR(prId: string, patch: Partial<Omit<PR, 'id'|'createdAt'>>) { const existing = getPR(prId); if (!existing) return null; return put('prs', { ...existing, ...patch, id: existing.id, updatedAt: now() }) }
export function deletePR(prId: string) { if (!getPR(prId)) return false; remove('prs', prId); return true }
export function reorderPRs(projectId: string, orderedIds: string[]) { const all = listPRs(projectId); if (orderedIds.length !== all.length || new Set(orderedIds).size !== all.length || orderedIds.some((x) => !all.some((p) => p.id === x))) return false; orderedIds.forEach((prId, position) => updatePR(prId, { position })); return true }

export function listQueue(): QueueItem[] { return listPRs('default-project').map((p) => ({ ...p, id: p.number, dependency: p.dependencies[0], branch: p.branch ?? `dev-queue/pr-${p.number}` })) }
export function createQueueItem(input: { title: string; objective: string; status?: QueueStatus; dependency?: string; branch?: string }) { const project = getProject('default-project') ?? createProject({ id: 'default-project', name: 'Dev Queue', goal: 'Execute queued work reliably', repositoryPath: process.cwd(), defaultBranch: 'main' }); const all = listPRs(project.id); return createPR({ projectId: project.id, number: Math.max(0, ...all.map((p) => p.number)) + 1, title: input.title, objective: input.objective, specification: input.objective, acceptanceCriteria: [], constraints: [], dependencies: input.dependency ? [input.dependency] : [], status: input.status ?? 'queued', priority: all.length, branch: input.branch, position: all.length }) }
function getQueuePR(number: number) { return listPRs('default-project').find((pr) => pr.number === number) ?? null }
export function updateQueueItem(number: number, patch: Partial<QueueItem>) { const item = getQueuePR(number); return item ? updatePR(item.id, patch) : null }
export function deleteQueueItem(number: number) { const item = getQueuePR(number); return item ? deletePR(item.id) : false }
export function reorderQueue(number: number, direction: 'up'|'down') { const items = listPRs('default-project'); const index = items.findIndex((x) => x.number === number); const target = index + (direction === 'up' ? -1 : 1); if (index < 0 || target < 0 || target >= items.length) return null; const ids = items.map((item) => item.id); [ids[index], ids[target]] = [ids[target], ids[index]]; reorderPRs('default-project', ids); return listQueue() }
export function closeQueueStore() { db.close() }

export function nextExecutablePR(projectId: string) { const prs = listPRs(projectId); return prs.find((pr) => pr.status === 'queued' && pr.dependencies.every((dep) => { const dependency = prs.find((candidate) => candidate.id === dep || String(candidate.number) === dep || `#${candidate.number}` === dep); return Boolean(dependency && dependency.status === 'done') })) ?? null }
export function createSession(input: Omit<WorkerSession, 'id'|'startedAt'|'updatedAt'>) { const timestamp = now(); return put('worker_sessions', { ...input, id: id(), startedAt: timestamp, updatedAt: timestamp }) }
export function listDecisions(prId: string) { return records<Decision>('decisions').filter((d) => d.prId === prId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)) }
export function addEvent(input: Omit<WorkerEvent, 'id'|'createdAt'>) { return put('worker_events', { ...input, id: id(), createdAt: now() }) }
export function buildTaskPacket(projectId: string, prId: string) { const project = getProject(projectId); const pr = getPR(prId); if (!project || !pr || pr.projectId !== projectId) return null; return { taskId: `task:${projectId}:${prId}`, projectId, prId, project: { name: project.name, goal: project.goal, repositoryPath: project.repositoryPath, defaultBranch: project.defaultBranch }, pr: { number: pr.number, title: pr.title, objective: pr.objective, specification: pr.specification, acceptanceCriteria: pr.acceptanceCriteria, constraints: pr.constraints, dependencies: pr.dependencies }, previousDecisions: listDecisions(prId), workerContract: { inspectBeforeChanging: true, runAcceptanceCriteria: true, preserveUnrelatedChanges: true, reportQuestions: true, reportResult: true } } }
