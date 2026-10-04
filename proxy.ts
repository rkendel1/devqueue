import {NextRequest,NextResponse} from 'next/server'
import {requireLocal} from './lib/local-boundary'
import {authenticateHuman} from './lib/human-auth'
import {ProtocolError} from './lib/auth-types'
export function proxy(request:NextRequest){try{requireLocal(request);if(!request.nextUrl.pathname.startsWith('/api/worker-sessions'))authenticateHuman(request);return NextResponse.next()}catch(e){return NextResponse.json({error:e instanceof ProtocolError?e.message:'local_boundary_unavailable'},{status:e instanceof ProtocolError?e.status:503})}}
export const config={matcher:'/api/:path*'}
