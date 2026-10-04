import { NextRequest, NextResponse } from 'next/server'
import { createQueueItem, listQueue } from '@/lib/queue-store'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function GET() {
  return NextResponse.json({ data: listQueue() }, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    if (typeof body.title !== 'string' || body.title.trim().length < 1 || typeof body.objective !== 'string' || body.objective.trim().length < 1) {
      return NextResponse.json({ error: 'title and objective are required' }, { status: 400 })
    }
    return NextResponse.json({ data: createQueueItem({ title: body.title.trim(), objective: body.objective.trim(), status: body.status, dependency: body.dependency, branch: body.branch }) }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}
