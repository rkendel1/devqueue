import { NextRequest, NextResponse } from 'next/server'
import { nextExecutablePR } from '@/lib/queue-store'
export async function GET(request: NextRequest) { const projectId = request.nextUrl.searchParams.get('projectId'); if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 }); return NextResponse.json({ data: await nextExecutablePR(projectId) }) }
