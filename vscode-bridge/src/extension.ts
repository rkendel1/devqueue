import { join } from 'node:path'
import { DurableWorkerLoop, type Binding as DurableBinding } from './worker/durable-loop'
import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import { HttpDevQueueClient, ClaimNextInput } from './dev-queue-client/client'
import { CodingWorker } from './worker/contracts'
import { ClineWorker } from './cline/cline-worker'
import { verifyWorkspace } from './worker/workspace'
type Pending = { endpoint: string; input: ClaimNextInput; key: string }
type Binding = { endpoint: string; sessionId: string }
export function activate(context: vscode.ExtensionContext) {
 const db=DurableWorkerLoop.open(join(context.globalStorageUri.fsPath,'feltdb-worker'))
 let loop:DurableWorkerLoop|undefined
 context.subscriptions.push({dispose(){loop?.disconnect();void db.close()}})
 const worker: CodingWorker = new ClineWorker()
 const config = () => vscode.workspace.getConfiguration('devQueue')
 const client = (endpoint: string) => new HttpDevQueueClient(endpoint, async () => context.secrets.get(`worker:${new URL(endpoint).origin}`))
 let busy = false
 async function guarded(action: () => Promise<void>) { if (busy) return; busy=true; try { await action() } catch(error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Bridge failed') } finally {busy=false} }
 async function resolveBinding(){
  const bindings=await db.collection<DurableBinding>('BridgeBinding').find()
  const pointer=context.globalState.get<Binding>('devQueue.session')
  if(pointer){if(!bindings.some(b=>b.sessionId===pointer.sessionId))await db.collection<DurableBinding>('BridgeBinding').insert({id:pointer.sessionId,...pointer},pointer.sessionId);return pointer}
  if(bindings.length>1)throw new Error('Multiple durable session bindings require explicit inspection; no claim or execution permitted')
  return bindings[0]
 }
 async function inspect() {
  const binding=await resolveBinding()
  if (!binding) { void vscode.window.showInformationMessage('No local session binding'); return }
  const session=await client(binding.endpoint).inspect(binding.sessionId)
  void vscode.window.showWarningMessage(`Session ${session.id}: ${session.status}. Reconnection does not resume Cline or start another claim. Inspect the worker manually.`)
  const doc=await vscode.workspace.openTextDocument({language:'json',content:JSON.stringify(session,null,2)})
  await vscode.window.showTextDocument(doc)
 }
 async function existingLoop(){
  const binding=await resolveBinding()
  if(!binding)throw new Error('No existing session binding; do not claim to recover')
  const api=client(binding.endpoint),session=await api.inspect(binding.sessionId)
  if(!vscode.workspace.isTrusted)throw new Error('Trusted workspace required')
  const roots=vscode.workspace.workspaceFolders
  if(!roots||roots.length!==1||roots[0].uri.scheme!=='file')throw new Error('Exactly one local workspace required')
  await verifyWorkspace(session.taskPacket.project.repositoryPath,roots.map(r=>r.uri.fsPath))
  loop?.disconnect();loop=new DurableWorkerLoop(db,api,binding.sessionId)
  return loop
 }
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.attachSession',()=>guarded(async()=>{
  if(await resolveBinding())throw new Error('Existing binding requires inspection; cannot replace it silently')
  if(!vscode.workspace.isTrusted)throw new Error('Trusted workspace required')
  const roots=vscode.workspace.workspaceFolders
  if(!roots||roots.length!==1||roots[0].uri.scheme!=='file')throw new Error('Exactly one local workspace required')
  const sessionId=await vscode.window.showInputBox({prompt:'Existing owned Dev Queue session ID (no claim or coding execution)'})
  if(!sessionId)return
  const endpoint=config().get<string>('endpoint')!,api=client(endpoint),session=await api.inspect(sessionId)
  await verifyWorkspace(session.taskPacket.project.repositoryPath,roots.map(r=>r.uri.fsPath))
  loop=new DurableWorkerLoop(db,api,sessionId);await loop.bind(endpoint)
  await context.globalState.update('devQueue.session',{endpoint,sessionId})
  await inspect()
 })))
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.reconnect',()=>guarded(async()=>{
  const recovery=await existingLoop(),session=await recovery.reconnect()
  void vscode.window.showWarningMessage(`Reconnected transport to ${session.id}: ${session.status}. Heartbeat means bridge connection, not coding execution. Cline was NOT started/resumed.`)
 })))
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.stop',()=>guarded(async()=>{
  const recovery=await existingLoop()
  await recovery.requestStop()
  try{await worker.stopTask();await recovery.acknowledgeTermination()}catch{void vscode.window.showWarningMessage('Stop requested durably; server fences further execution evidence. Cline termination is unverified: inspect/stop it manually. No termination acknowledgement sent.')}
 })))
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.testConnection',()=>guarded(async()=>{
  if (!vscode.workspace.isTrusted) throw new Error('Trusted workspace required')
  const roots=vscode.workspace.workspaceFolders
  if (!roots || roots.length!==1 || roots[0].uri.scheme!=='file')throw new Error('Exactly one local workspace required')
  const projectId=config().get<string>('projectId')!
  if (!projectId)throw new Error('Configure devQueue.projectId')
  const readiness=await client(config().get<string>('endpoint')!).readiness(projectId)
  await verifyWorkspace(readiness.repositoryPath,roots.map(r=>r.uri.fsPath))
  void vscode.window.showInformationMessage(`Authenticated worker ${readiness.workerId}; project ${readiness.projectId} authorized; workspace matches. No work claimed.`)
 })))
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.setup',()=>guarded(async()=>{
  const endpoint=config().get<string>('endpoint')!
  client(endpoint) // validate transport before storing credentials
  const token=await vscode.window.showInputBox({password:true,prompt:'Dedicated Dev Queue worker token (never the human token)',ignoreFocusOut:true})
  if (!token) return
  await context.secrets.store(`worker:${new URL(endpoint).origin}`,token)
  void vscode.window.showInformationMessage('Worker credential stored in VS Code SecretStorage. Server determines identity and project grants.')
 })))
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.inspectSession',()=>guarded(inspect)))
 context.subscriptions.push(vscode.commands.registerCommand('devQueue.startNext',()=>guarded(async()=>{
  if ((await db.collection<DurableBinding>('BridgeBinding').find()).length || context.globalState.get<Binding>('devQueue.session')) { await inspect(); throw new Error('Existing session binding requires attention; no second claim is permitted') }
  if (!vscode.workspace.isTrusted) throw new Error('Trusted workspace required')
  const roots=vscode.workspace.workspaceFolders
  if (!roots || roots.length!==1 || roots[0].uri.scheme!=='file') throw new Error('Exactly one local workspace required; remote/multi-root execution is refused')
  // Prove the adapter is available BEFORE claiming durable work.
  // Current Cline adapter fails here, so no unusable session is created.
  await worker.connect()
  const endpoint=config().get<string>('endpoint')!, projectId=config().get<string>('projectId')!
  if (!projectId) throw new Error('Configure devQueue.projectId')
  let pending=context.globalState.get<Pending>('devQueue.pendingClaim')
  if (!pending) { pending={endpoint,input:{projectId,workerType:'vscode-cline-bridge',workspacePath:roots[0].uri.fsPath},key:randomUUID()}; await context.globalState.update('devQueue.pendingClaim',pending) }
  if (pending.input.workspacePath !== roots[0].uri.fsPath) throw new Error('Pending claim belongs to another workspace; inspect and recover it manually')
  // Persist key BEFORE sending. Lost responses replay this exact claim on restart.
  const api=client(pending.endpoint)
  const claimed=await api.claimNext(pending.input,pending.key)
  loop=new DurableWorkerLoop(db,api,claimed.session.id)
  await loop.bind(pending.endpoint)
  await context.globalState.update('devQueue.session',{endpoint:pending.endpoint,sessionId:claimed.session.id})
  await context.globalState.update('devQueue.pendingClaim',undefined)
  await verifyWorkspace(claimed.taskPacket.project.repositoryPath,roots.map(r=>r.uri.fsPath))
  const doc=await vscode.workspace.openTextDocument({language:'json',content:JSON.stringify(claimed.taskPacket,null,2)})
  await vscode.window.showTextDocument(doc)
  const confirmation=await vscode.window.showInformationMessage('Authoritative TaskPacket shown. Start this task?',{modal:true},'Start Task')
  if (confirmation!=='Start Task') return
  await worker.startTask(claimed.taskPacket)
  // No activity is reported until a verified adapter can observe it.
  // A supported execution/event transport must be implemented before enabling connect().
 })))
 void (async()=>{
  const bindings=await db.collection<DurableBinding>('BridgeBinding').find()
  if(!context.globalState.get('devQueue.session')&&bindings.length===1)await context.globalState.update('devQueue.session',{endpoint:bindings[0].endpoint,sessionId:bindings[0].sessionId})
  if(context.globalState.get('devQueue.session')){try{await inspect();void vscode.window.showWarningMessage('Existing task detected. Use Reconnect, Request Stop, or Inspect. No automatic execution.')}catch{void vscode.window.showWarningMessage('Existing task requires attention; server unreachable. Binding retained.')}}
 })().catch(()=>vscode.window.showErrorMessage('Durable bridge state requires inspection'))
 if (context.globalState.get('devQueue.session') || context.globalState.get('devQueue.pendingClaim')) void vscode.window.showWarningMessage('Dev Queue session/claim requires inspection after restart. Automatic execution is disabled.')
}
export function deactivate() { /* Context disposal stops transport and closes FeltDB. */ }
