import {authenticateHuman} from '@/lib/human-auth'
import {answerQuestion,retryTask} from '@/lib/local-actions'
import {httpError,humanProject} from '@/lib/human-http'
import {ProtocolError} from '@/lib/auth-types'
export async function POST(request:Request){try{authenticateHuman(request);const body=await request.json();if(body.action==='answer'){if(typeof body.sessionId!=='string'||typeof body.answer!=='string')throw new ProtocolError(400,'invalid_answer');return Response.json({data:await answerQuestion(body.sessionId,body.answer)})}if(body.action==='retry'){const projectId=await humanProject(request,body);return Response.json({data:await retryTask(projectId,body.number)})}throw new ProtocolError(400,'invalid_action')}catch(e){return httpError(e)}}
