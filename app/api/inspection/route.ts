import { database } from '@/lib/queue-store'
import { humanProject,httpError } from '@/lib/human-http'
export async function GET(request:Request){try{const projectId=await humanProject(request),db=database(),sessions=await db.collection<{id:string;projectId:string}>('WorkerSession').find({projectId}),events=(await Promise.all(sessions.map(s=>db.collection('WorkerEvent').find({sessionId:s.id})))).flat();return Response.json({data:{projectId,sessions,events}},{headers:{'Cache-Control':'no-store'}})}catch(e){return httpError(e)}}
