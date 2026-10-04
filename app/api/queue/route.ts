import { createQueueItem, listQueue } from '@/lib/queue-store'
import { humanProject, httpError, taskInput } from '@/lib/human-http'
import { ProtocolError } from '@/lib/auth-types'
export async function GET(request:Request){try{const projectId=await humanProject(request);return Response.json({data:await listQueue(projectId)})}catch(e){return httpError(e)}}
export async function POST(request:Request){try{const body=await request.json(),projectId=await humanProject(request,body),input=taskInput(body);if(typeof input.title!=='string'||!input.title.trim()||typeof input.objective!=='string'||!input.objective.trim())throw new ProtocolError(400,'title_and_objective_required');return Response.json({data:await createQueueItem({...input,projectId,title:input.title,objective:input.objective})},{status:201})}catch(e){return httpError(e)}}
