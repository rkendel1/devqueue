import {spawn} from 'node:child_process'
import {realpath} from 'node:fs/promises'
import type {StateFirstDB} from '@feltdb/core'
import type {Session} from '../worker-protocol'
import type {PR} from '../queue-store'
import {ProtocolError} from '../auth-types'
export type GateEvidence={id:string;prId:string;sessionId:string;command:string;workingDirectory:string;startedAt:string;completedAt:string;exitCode:number|null;stdout:string;stderr:string;result:'PASS'|'FAIL'}
const commands:Record<string,string[]>={'npm test':['test'],'npm run typecheck':['run','typecheck'],'npm run build':['run','build']}
export async function runGate(command:string,workingDirectory:string):Promise<Omit<GateEvidence,'id'|'prId'|'sessionId'>>{
 const args=commands[command]
 if(!args)throw new ProtocolError(400,'unsupported_acceptance_command')
 const startedAt=new Date().toISOString()
 return new Promise(resolve=>{
 // No shell interpolation. Repository npm scripts are executable code: human-authorized only.
 const child=spawn('npm',args,{cwd:workingDirectory,env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,CI:'1',NODE_ENV:'test'},detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']})
 const terminate=()=>{try{if(process.platform!=='win32')process.kill(-child.pid!,'SIGKILL');else child.kill('SIGKILL')}catch{}}
 let stdout='',stderr='',exceeded=false
 const cap=1024*1024
 const timer=setTimeout(()=>{exceeded=true;terminate()},60000)
 child.stdout.on('data',b=>{stdout=(stdout+b).slice(0,cap);if(stdout.length>=cap){exceeded=true;terminate()}})
 child.stderr.on('data',b=>{stderr=(stderr+b).slice(0,cap);if(stderr.length>=cap){exceeded=true;terminate()}})
 child.on('error',e=>{stderr=e.message})
 child.on('close',exitCode=>{clearTimeout(timer);resolve({command,workingDirectory,startedAt,completedAt:new Date().toISOString(),exitCode,stdout,stderr,result:exitCode===0&&!exceeded?'PASS':'FAIL'})})
 })
}
// Explicit HUMAN invocation; worker cannot execute acceptance or mark done.
export async function evaluateAcceptance(db:StateFirstDB,sessionId:string){
 const original=await db.collection<Session>('WorkerSession').get(sessionId)
 if(!original)throw new ProtocolError(404,'session_not_found')
 const basis=await db.readBasis({records:[{collection:'WorkerSession',id:sessionId},{collection:'PR',id:original.prId}]})
 const session=await db.collection<Session>('WorkerSession').get(sessionId),pr=await db.collection<PR>('PR').get(original.prId)
 if(!session||!pr||session.status!=='running'||pr.workerSessionId!==sessionId||session.stopRequestedAt||session.currentQuestion||session.resultEvidence?.result!=='PASS'||!session.completionRequestedAt)throw new ProtocolError(409,'acceptance_not_eligible')
 const snapshot=session.taskPacket as unknown as {project:{repositoryPath:string};pr:PR}
 const criteria=snapshot.pr.acceptanceCriteria
 if(!criteria.length)throw new ProtocolError(409,'acceptance_criteria_empty')
 if(criteria.some(c=>!commands[c]))throw new ProtocolError(400,'unsupported_acceptance_command')
 const root=await realpath(snapshot.project.repositoryPath)
 if(await realpath(session.workspacePath)!==root)throw new ProtocolError(409,'workspace_mismatch')
 const runId=crypto.randomUUID()
 if((session as Session & {acceptanceRunId?:string}).acceptanceRunId)throw new ProtocolError(409,'acceptance_already_admitted_requires_attention')
 await db.transaction({fences:[basis],operations:[{collection:'WorkerSession',id:sessionId,value:{...session,acceptanceRunId:runId}}]})
 const admittedBasis=await db.readBasis({records:[{collection:'WorkerSession',id:sessionId},{collection:'PR',id:pr.id}]})
 const admittedSession=await db.collection<Session>('WorkerSession').get(sessionId)
 const admittedPr=await db.collection<PR>('PR').get(pr.id)
 if(!admittedSession||admittedSession.sequence!==session.sequence||admittedSession.status!=='running'||admittedSession.stopRequestedAt||!admittedPr||admittedPr.workerSessionId!==sessionId||admittedPr.status!=='running')throw new ProtocolError(409,'acceptance_state_changed_requires_attention')
 const evidence:GateEvidence[]=[]
 for(const command of criteria){
  const gate={...await runGate(command,root),id:crypto.randomUUID(),sessionId,prId:pr.id}
  // Persist each observed gate even if admission state changes during execution.
  await db.collection<GateEvidence>('AcceptanceEvidence').insert(gate,gate.id);evidence.push(gate)
 }
 const passed=evidence.every(g=>g.result==='PASS'),timestamp=new Date().toISOString(),sequence=session.sequence+1
 await db.transaction({fences:[admittedBasis],operations:[
  {collection:'WorkerSession',id:sessionId,value:{...session,acceptanceRunId:runId,status:passed?'completed':'failed',completedAt:timestamp,updatedAt:timestamp,sequence}},
  {collection:'PR',id:pr.id,value:{...admittedPr,status:passed?'done':'failed',result:passed?'PASS':'FAIL',updatedAt:timestamp}},
  {collection:'WorkerEvent',id:`${sessionId}-${sequence}`,requireAbsent:true,value:{id:`${sessionId}-${sequence}`,sessionId,sequence,type:passed?'completed':'failed',message:passed?'Human-authorized acceptance gates passed':'Human-authorized acceptance gates failed',metadata:{gateIds:evidence.map(g=>g.id)},createdAt:timestamp}},
 ]})
 return {result:passed?'PASS':'FAIL',evidence}
}
