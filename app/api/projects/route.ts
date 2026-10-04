import { NextRequest, NextResponse } from 'next/server'
import { createProject, listProjects } from '@/lib/queue-store'
export async function GET() { return NextResponse.json({ data: listProjects() }) }
export async function POST(request: NextRequest) { try { const body = await request.json(); if (!body.name || !body.goal) return NextResponse.json({ error: 'name and goal are required' }, { status: 400 }); return NextResponse.json({ data: createProject({ name: body.name, goal: body.goal, repositoryPath: body.repositoryPath ?? process.cwd(), defaultBranch: body.defaultBranch ?? 'main' }) }, { status: 201 }) } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) } }
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } }) }
