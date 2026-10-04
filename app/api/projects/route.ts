import {createProject,listProjects} from '@/lib/queue-store'
import {authenticateHuman} from '@/lib/human-auth'
import {httpError} from '@/lib/human-http'
import {ProtocolError} from '@/lib/auth-types'
export async function GET(request:Request){try{authenticateHuman(request);return Response.json({data:await listProjects()})}catch(e){return httpError(e)}}
export async function POST(request:Request){try{authenticateHuman(request);const body=await request.json();for(const key of ['name','goal','repositoryPath','defaultBranch'])if(typeof body[key]!=='string'||!body[key].trim())throw new ProtocolError(400,'invalid_'+key);return Response.json({data:await createProject({name:body.name,goal:body.goal,repositoryPath:body.repositoryPath,defaultBranch:body.defaultBranch})},{status:201})}catch(e){return httpError(e)}}
