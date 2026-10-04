import { nextExecutablePR } from '@/lib/queue-store'
import { humanProject,httpError } from '@/lib/human-http'
export async function GET(request:Request){try{const projectId=await humanProject(request);return Response.json({data:await nextExecutablePR(projectId)})}catch(e){return httpError(e)}}
