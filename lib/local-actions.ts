import { database } from './queue-store'
import { ProtocolError } from './auth-types'
import type { PR } from './queue-store'
import type { Session } from './worker-protocol'
export async function answerQuestion(sessionId:string,answer:string){
 if(!answer.trim())throw new ProtocolError(400,'answer_required')
 const db=database(),original=await db.collection<Session>('WorkerSession').get(sessionId)
 if(!original)throw new ProtocolError(404,'session_not_found')
 const basis=await db.readBasis({records:[{collection:'WorkerSession',id:sessionId},{collection:'PR',id:original.prId}]})
 const session=await db.collection<Session>('WorkerSession').get(sessionId),pr=await db.collection<PR>('PR').get(original.prId)
 if(!session||!pr||session.status!=='waiting'||pr.workerSessionId!==sessionId||!session.currentQuestion)throw new ProtocolError(409,'not_waiting')
 const timestamp=new Date().toISOString(),id=crypto.randomUUID(),sequence=session.sequence+1
 const decision={id,sessionId,prId:pr.id,question:session.currentQuestion,answer,requiresHumanApproval:true,createdAt:timestamp}
 await db.transaction({fences:[basis],operations:[{collection:'Decision',id,requireAbsent:true,value:decision},{collection:'WorkerSession',id:sessionId,value:{...session,status:'running',currentQuestion:'',sequence,updatedAt:timestamp}},{collection:'PR',id:pr.id,value:{...pr,status:'running',currentQuestion:'',updatedAt:timestamp}},{collection:'WorkerEvent',id:`${sessionId}-${sequence}`,requireAbsent:true,value:{id:`${sessionId}-${sequence}`,sessionId,sequence,type:'progress',message:'Local operator answered question',metadata:{decisionId:id},createdAt:timestamp}}]})
 return decision
}
export async function retryTask(projectId:string,number:number){const db=database(),items=await db.collection<PR>('PR').find({projectId}),pr=items.find(p=>p.number===number);if(!pr)throw new ProtocolError(404,'pr_not_found');const basis=await db.readBasis({records:[{collection:'PR',id:pr.id}]});const latest=await db.collection<PR>('PR').get(pr.id);if(latest?.status!=='failed')throw new ProtocolError(409,'retry_requires_failed');const {workerSessionId,currentQuestion,result,...rest}=latest;await db.transaction({fences:[basis],operations:[{collection:'PR',id:pr.id,value:{...rest,status:'queued',updatedAt:new Date().toISOString()}}]});return {retried:true}}
