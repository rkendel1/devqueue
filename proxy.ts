import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Dev Queue production API is disabled pending trusted caller authentication.' }, { status: 503 })
  if (request.nextUrl.pathname.startsWith('/api/worker-sessions')) return NextResponse.next()
  const expected = process.env.DEV_QUEUE_LOCAL_HUMAN_TOKEN ?? ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (process.env.DEV_QUEUE_LOCAL_AUTH !== 'enabled' || expected.length < 32 || Buffer.byteLength(expected) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return NextResponse.json({ error: 'human_capability_required' }, { status: 403 })
  return NextResponse.next()
}
export const config = { matcher: '/api/:path*' }
