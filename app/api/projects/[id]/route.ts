import {getProject,updateProject} from '@/lib/queue-store'
import {authenticateHuman} from '@/lib/human-auth'
import {httpError} from '@/lib/human-http'
import {ProtocolError} from '@/lib/auth-types'
type Context={params:Promise<{id:string}>}
export async function GET(request:Request,context:Context){try{authenticateHuman(request);const data=await getProject((await context.params).id);if(!data)throw new ProtocolError(404,'project_not_found');return Response.json({data})}catch(e){return httpError(e)}}
export async function PATCH(request:Request,context:Context){try{authenticateHuman(request);const body=await request.json(),patch:Record<string,string>={};for(const key of ['name','goal','repositoryPath','defaultBranch'])if(key in body){if(typeof body[key]!=='string'||!body[key].trim())throw new ProtocolError(400,'invalid_'+key);patch[key]=body[key]}const data=await updateProject((await context.params).id,patch);if(!data)throw new ProtocolError(404,'project_not_found');return Response.json({data})}catch(e){return httpError(e)}}
