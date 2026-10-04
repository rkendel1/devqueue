import * as vscode from 'vscode'
import { randomUUID } from 'node:crypto'
import { HttpDevQueueClient, ClaimNextInput } from './dev-queue-client/client'
import { CodingWorker } from './worker/contracts'
import { ClineWorker } from './cline/cline-worker'
import { verifyWorkspace } from './worker/workspace'
type Pending = { endpoint: string; input: ClaimNextInput; key: string }
type Binding = { endpoint: string; sessionId: string }
export function activate(context: vscode.ExtensionContext) {
 const worker: CodingWorker = new ClineWorker()
 const config = () => vscode.workspace.getConfiguration('devQueue')
 const client = (endpoint: string) => new HttpDevQueueClient(endpoint, async () => context.secrets.get(`worker:${new URL(endpoint).origin}`))
 let busy = false
 async function guarded(action: () => Promise<void>) { if (busy) return; busy=true; try { await action() } catch(error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Bridge failed') } finally {busy=false} }
 async function inspect() {
  const binding=context.globalState.get<Binding>('devQueue.session')
  if (!binding) { void vscode.window.showInformationMessage('No local session binding'); return }
  const session=await client(binding.endpoint).inspect(binding.sessionId)
  void vscode.window.showWarningMessage(`Session ${session.id}: ${session.status}. Reconnection does not resume Cline or start another claim. Inspect the worker manually.`)
  const doc=await vscode.workspace.openTextDocument({language:'json',content:JSON.stringify(session,null,2)})
  await vscode.window.showTextDocument(doc)
 }
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
  if (context.globalState.get<Binding>('devQueue.session')) { await inspect(); throw new Error('Existing session binding requires attention; no second claim is permitted') }
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
 if (context.globalState.get('devQueue.session') || context.globalState.get('devQueue.pendingClaim')) void vscode.window.showWarningMessage('Dev Queue session/claim requires inspection after restart. Automatic execution is disabled.')
}
export function deactivate() { /* No worker heartbeat is active in the disabled adapter. */ }
