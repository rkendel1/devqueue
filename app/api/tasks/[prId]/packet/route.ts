import { NextRequest, NextResponse } from 'next/server'
import { buildTaskPacket } from '@/lib/queue-store'
export async function POST(request: NextRequest, context: { params: Promise<{ prId: string }> }) { const body = await request.json().catch(() => ({})); const packet = buildTaskPacket(body.projectId, (await context.params).prId); return packet ? NextResponse.json({ data: packet }) : NextResponse.json({ error: 'Project or PR not found' }, { status: 404 }) }
