import { NextRequest, NextResponse } from 'next/server'
import { deleteQueueItem, listQueue, reorderQueue, updateQueueItem } from '@/lib/queue-store'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

type Context = { params: Promise<{ id: string }> }
async function getId(context: Context) {
  const id = Number((await context.params).id)
  return Number.isInteger(id) ? id : null
}

export async function GET(_request: NextRequest, context: Context) {
  const id = await getId(context)
  const item = id === null ? null : (await listQueue()).find((entry) => entry.id === id)
  return item ? NextResponse.json({ data: item }) : NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
}

export async function PATCH(request: NextRequest, context: Context) {
  const id = await getId(context)
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await request.json()
    if (body.action === 'reorder') {
      if (!['up', 'down'].includes(body.direction)) return NextResponse.json({ error: 'direction must be up or down' }, { status: 400 });
      const data = await reorderQueue(id, body.direction === 'up' ? 'up' : 'down')
      return data ? NextResponse.json({ data }) : NextResponse.json({ error: 'Cannot reorder item' }, { status: 409 })
    }
    const patch = Object.fromEntries(['title', 'objective', 'branch'].filter((key) => key in body).map((key) => [key, body[key]]))
    if (patch.title !== undefined && (typeof patch.title !== 'string' || !patch.title.trim())) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    if (patch.objective !== undefined && (typeof patch.objective !== 'string' || !patch.objective.trim())) return NextResponse.json({ error: 'objective cannot be empty' }, { status: 400 })
    const item = await updateQueueItem(id, patch)
    return item ? NextResponse.json({ data: item }) : NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const id = await getId(context)
  if (id === null) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  return await deleteQueueItem(id) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
}
