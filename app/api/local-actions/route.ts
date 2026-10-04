import {database} from '@/lib/queue-store'
import {WorkerProtocol,type Session} from '@/lib/worker-protocol'
import {authenticateHuman} from '@/lib/human-auth'
import {answerQuestion,retryTask} from '@/lib/local-actions'
import {httpError,humanProject} from '@/lib/human-http'
import {ProtocolError} from '@/lib/auth-types'
export async function POST(request:Request){try{authenticateHuman(request);const body=await request.json();if(body.action==='stop'){if(typeof body.sessionId!=='string')throw new ProtocolError(400,'sessionId_required');const db=database(),session=await db.collection<Session>('WorkerSession').get(body.sessionId);if(!session)throw new ProtocolError(404,'session_not_found');return Response.json({data:await new WorkerProtocol(db).act({id:session.ownerId,projects:[session.projectId]},session.id,'stop',{},crypto.randomUUID())})}if(body.action==='answer'){if(typeof body.sessionId!=='string'||typeof body.answer!=='string')throw new ProtocolError(400,'invalid_answer');return Response.json({data:await answerQuestion(body.sessionId,body.answer)})}if(body.action==='retry'){const projectId=await humanProject(request,body);return Response.json({data:await retryTask(projectId,body.number)})}throw new ProtocolError(400,'invalid_action')}catch(e){return httpError(e)}}
