import { ProtocolError } from './auth-types'
export function requireLocal(request:Request){
 const url=new URL(request.url)
 if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new ProtocolError(403,'local_only')
 const origin=request.headers.get('origin')
 if(origin&&origin!==url.origin)throw new ProtocolError(403,'cross_origin_forbidden')
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new ProtocolError(403,'cross_origin_forbidden')
}
