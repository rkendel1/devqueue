import { NextRequest, NextResponse } from 'next/server'
// Fail closed on deployment until caller-level authorization is integrated.
// A shared FeltDB server key must not turn anonymous requests into human authority.
export function proxy(_request: NextRequest) {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Dev Queue production API is disabled pending caller authentication and worker evidence protocol integration.' }, { status: 503 })
  return NextResponse.next()
}
export const config = { matcher: '/api/:path*' }
