import { selectNext } from './queue-selection'
import { createFeltDB, StateFirstDB } from '@feltdb/core'

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
    // Existing FeltDB local durable runtime; never choose managed authority.
    instance = createFeltDB({ namespace: 'dev-queue', mode: 'local', path: process.env.DEV_QUEUE_LOCAL_DATA_PATH ?? '.dev-queue/data' })
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

export async function listPRs(projectId: string) { return (await records<PR>('prs')).filter((p) => p.projectId === projectId).sort((a,b) => a.position - b.position || a.priority - b.priority || a.id.localeCompare(b.id)) }
export async function getPR(prId: string) { return get<PR>('prs', prId) }
export async function createPR(input: Omit<PR, 'id'|'createdAt'|'updatedAt'|'position'> & { position?: number }) { const timestamp = now(); const existing = (await listPRs(input.projectId)); return put('prs', { ...input, id: id(), position: input.position ?? existing.length, createdAt: timestamp, updatedAt: timestamp }) }
export async function updatePR(prId: string, patch: Partial<Omit<PR, 'id'|'createdAt'>>) { const existing = (await getPR(prId)); if (!existing) return null; if (patch.status && patch.status !== existing.status) throw new Error('Execution state is owned by the runner and evidence protocol'); return put('prs', { ...existing, ...patch, id: existing.id, updatedAt: now() }) }
export async function deletePR(prId: string) { const existing = await getPR(prId); if (!existing) return false; if (['running', 'waiting'].includes(existing.status)) throw new Error('Cannot delete active work'); (await remove('prs', prId)); return true }
export async function reorderPRs(projectId: string, orderedIds: string[]) { const basis = await database().readBasis({ predicates: [{ collection: 'PR', where: [{ field: 'projectId', eq: projectId }] }] }); const all = (await listPRs(projectId)); if (orderedIds.length !== all.length || new Set(orderedIds).size !== all.length || orderedIds.some((x) => !all.some((p) => p.id === x))) return false; await database().transaction({ fences: [basis], operations: orderedIds.map((prId, priority) => ({ collection: 'PR', id: prId, value: { ...all.find(p => p.id === prId)!, position: priority, updatedAt: now() } })) }); return true }

export async function requireProject(projectId: string) {
 if (!projectId) throw new Error('projectId_required')
 const project = await getProject(projectId)
 if (!project) throw new Error('project_not_found')
 return project
}
export async function listQueue(projectId: string): Promise<QueueItem[]> { await requireProject(projectId); return (await listPRs(projectId)).map(p => ({ ...p, id: p.number })) }
export async function createQueueItem(input: { projectId: string; title: string; objective: string; specification?: string; acceptanceCriteria?: string[]; constraints?: string[]; dependencies?: string[]; number?: number; priority?: number; position?: number; branch?: string }) {
 const db=database(), projectId=input.projectId
 await requireProject(projectId)
 const basis=await db.readBasis({ records:[{collection:'Project',id:projectId}],predicates:[{collection:'PR',where:[{field:'projectId',eq:projectId}]}] })
 const all=await listPRs(projectId),timestamp=now()
 const number=input.number ?? Math.max(0,...all.map(p=>p.number))+1
 if (!Number.isInteger(number)||number<1||all.some(p=>p.number===number))throw new Error('invalid_or_duplicate_number')
 const pr:PR={id:id(),projectId,number,title:input.title,objective:input.objective,specification:input.specification??'',acceptanceCriteria:input.acceptanceCriteria??[],constraints:input.constraints??[],dependencies:input.dependencies??[],status:'queued',priority:input.priority??Math.max(-1,...all.map(p=>p.priority))+1,position:input.position??all.length,...(input.branch?{branch:input.branch}:{}),createdAt:timestamp,updatedAt:timestamp}
 await db.transaction({fences:[basis],operations:[{collection:'PR',id:pr.id,requireAbsent:true,value:pr}]})
 return {...pr,id:pr.number}
}
async function getQueuePR(projectId:string,number:number){await requireProject(projectId);return (await listPRs(projectId)).find(p=>p.number===number)??null}
export async function updateQueueItem(projectId:string,number:number,patch:Partial<QueueItem>){const item=await getQueuePR(projectId,number);if(!item)return null;const basis=await database().readBasis({records:[{collection:'PR',id:item.id}]});const latest=await getPR(item.id);if(!latest)return null;const allowed=['title','objective','specification','acceptanceCriteria','constraints','dependencies','branch','priority','position'];const safe=Object.fromEntries(Object.entries(patch).filter(([k])=>allowed.includes(k)));const updated={...latest,...safe,updatedAt:now()};await database().transaction({fences:[basis],operations:[{collection:'PR',id:item.id,value:updated}]});return {...updated,id:updated.number}}
export async function deleteQueueItem(projectId:string,number:number){const item=await getQueuePR(projectId,number);return item?deletePR(item.id):false}
export async function reorderQueue(projectId:string,number:number,direction:'up'|'down'){await requireProject(projectId);const items=await listPRs(projectId),index=items.findIndex(p=>p.number===number),target=index+(direction==='up'?-1:1);if(index<0||target<0||target>=items.length)return null;const ids=items.map(p=>p.id);[ids[index],ids[target]]=[ids[target],ids[index]];await reorderPRs(projectId,ids);return listQueue(projectId)}
export async function closeQueueStore() { instance?.close() }

export async function nextExecutablePR(projectId: string) { return selectNext(await listPRs(projectId)) }
export async function createSession(input: Omit<WorkerSession, 'id'|'startedAt'|'updatedAt'>) { const timestamp = now(); return put('worker_sessions', { ...input, id: id(), startedAt: timestamp, updatedAt: timestamp }) }
export async function listDecisions(prId: string) { return (await records<Decision>('decisions')).filter((d) => d.prId === prId).sort((a,b) => a.createdAt.localeCompare(b.createdAt)) }
export async function addEvent(input: Omit<WorkerEvent, 'id'|'createdAt'>) { return put('worker_events', { ...input, id: id(), createdAt: now() }) }
export async function buildTaskPacket(projectId: string, prId: string) { const project = (await getProject(projectId)); const pr = (await getPR(prId)); if (!project || !pr || pr.projectId !== projectId) return null; return { taskId: `task:${projectId}:${prId}`, projectId, prId, project: { name: project.name, goal: project.goal, repositoryPath: project.repositoryPath, defaultBranch: project.defaultBranch }, pr: { number: pr.number, title: pr.title, objective: pr.objective, specification: pr.specification, acceptanceCriteria: pr.acceptanceCriteria, constraints: pr.constraints, dependencies: pr.dependencies }, previousDecisions: (await listDecisions(prId)), workerContract: { inspectBeforeChanging: true, runAcceptanceCriteria: true, preserveUnrelatedChanges: true, reportQuestions: true, reportResult: true } } }
