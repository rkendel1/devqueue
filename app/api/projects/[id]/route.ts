import { NextRequest, NextResponse } from 'next/server'
import { deleteProject, getProject, updateProject } from '@/lib/queue-store'
type Context = { params: Promise<{ id: string }> }
export async function GET(_: NextRequest, context: Context) { const item = getProject((await context.params).id); return item ? NextResponse.json({ data: item }) : NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
export async function PATCH(request: NextRequest, context: Context) { try { const id = (await context.params).id; const body = await request.json(); const item = updateProject(id, body); return item ? NextResponse.json({ data: item }) : NextResponse.json({ error: 'Project not found' }, { status: 404 }) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) } }
export async function DELETE(_: NextRequest, context: Context) { return deleteProject((await context.params).id) ? new NextResponse(null, { status: 204 }) : NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
export async function OPTIONS() { return new NextResponse(null, { status: 204 }) }
