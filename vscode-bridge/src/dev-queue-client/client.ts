import { randomUUID } from 'node:crypto'
import { TaskPacket } from '../worker/contracts'
export type Session = { id: string; status: string; taskPacket: TaskPacket }
export type ClaimNextInput = { projectId: string; workerType: string; workspacePath: string }
export type ClaimResult = { session: Session; taskPacket: TaskPacket }
export interface DevQueueClient {
 claimNext(input: ClaimNextInput, key: string): Promise<ClaimResult>
 readiness(projectId: string): Promise<{workerId: string;projectId:string;repositoryPath:string;authenticated:boolean;authorized:boolean}>
 decisions(sessionId: string): Promise<unknown[]>
 inspect(sessionId: string): Promise<Session>
 heartbeat(sessionId: string, key?: string): Promise<unknown>
 appendEvent(sessionId: string, event: Record<string, unknown>, key?: string): Promise<unknown>
 askQuestion(sessionId: string, question: { message: string }, key?: string): Promise<unknown>
 reportResult(sessionId: string, result: Record<string, unknown>, key?: string): Promise<unknown>
 requestCompletion(sessionId: string, key?: string): Promise<unknown>
 fail(sessionId: string, error: { message: string }, key?: string): Promise<unknown>
}
export class HttpDevQueueClient implements DevQueueClient {
 private endpoint: URL
 constructor(endpoint: string, private credential: () => Promise<string | undefined>) {
  this.endpoint = new URL(endpoint)
  if (this.endpoint.username || this.endpoint.password || this.endpoint.search || this.endpoint.hash || (this.endpoint.protocol !== 'https:' && !(this.endpoint.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(this.endpoint.hostname)))) throw new Error('Use HTTPS or explicit loopback HTTP; no URL credentials')
 }
 private async request(path: string, body?: unknown, key?: string): Promise<any> {
  const token = await this.credential()
  if (!token) throw new Error('Worker credential missing: run Configure Worker')
  const response = await fetch(new URL('/api/worker-sessions' + path, this.endpoint), { method: body === undefined ? 'GET' : 'POST', redirect:'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json', ...(key ? {'Idempotency-Key':key} : {}) }, ...(body === undefined ? {} : {body:JSON.stringify(body)}) })
  const payload = await response.json() as { data?: unknown; error?: string }
  if (!response.ok) throw new Error(`Dev Queue ${response.status}: ${payload.error ?? 'request failed'}`)
  return payload.data
 }
 claimNext(input: ClaimNextInput, key: string): Promise<ClaimResult> { return this.request('/claim-next',input,key) }
 readiness(projectId: string) { return this.request('/readiness?projectId='+encodeURIComponent(projectId)) }
 decisions(id:string) { return this.request('/'+encodeURIComponent(id)+'/decisions') }
 inspect(id: string): Promise<Session> { return this.request('/'+encodeURIComponent(id)) }
 heartbeat(id: string,key=randomUUID()) { return this.request(`/${encodeURIComponent(id)}/heartbeat`,{},key) }
 appendEvent(id: string,event:Record<string,unknown>,key=randomUUID()) { return this.request(`/${encodeURIComponent(id)}/events`,event,key) }
 askQuestion(id: string,body:{message:string},key=randomUUID()) { return this.request(`/${encodeURIComponent(id)}/question`,body,key) }
 reportResult(id: string,body:Record<string,unknown>,key=randomUUID()) { return this.request(`/${encodeURIComponent(id)}/result`,body,key) }
 requestCompletion(id: string,key=randomUUID()) { return this.request(`/${encodeURIComponent(id)}/complete`,{},key) }
 fail(id: string,body:{message:string},key=randomUUID()) { return this.request(`/${encodeURIComponent(id)}/fail`,body,key) }
}
