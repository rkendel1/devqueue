// Human boundary for the single-user local application. No hosted identities.
import { requireLocal } from './local-boundary'
import { ProtocolError } from './auth-types'
export function authenticateHuman(request:Request){requireLocal(request);if(request.headers.has('authorization'))throw new ProtocolError(403,'worker_cannot_use_human_api');return {id:'local-operator',administrator:true}}
