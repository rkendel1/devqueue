import { NextRequest, NextResponse } from 'next/server'
import { authenticateHuman } from './lib/production-auth'
import { ProtocolError } from './lib/auth-types'
export function proxy(request: NextRequest) {
 try {
  if (process.env.NODE_ENV === 'production' && (!process.env.FELTDB_URL || !process.env.FELTDB_TOKEN || !process.env.FELTDB_APPLICATION_ID || !process.env.FELTDB_ENVIRONMENT || !process.env.DEV_QUEUE_HUMAN_TOKEN_SHA256)) return NextResponse.json({error:'production_configuration_unavailable'},{status:503})
  if (request.nextUrl.pathname.startsWith('/api/worker-sessions')) return NextResponse.next()
  authenticateHuman(request)
  return NextResponse.next()
 } catch(error) { return NextResponse.json({ error: error instanceof ProtocolError ? error.message : 'authentication_unavailable' }, {status:error instanceof ProtocolError ? error.status : 503}) }
}
export const config = { matcher: '/api/:path*' }
