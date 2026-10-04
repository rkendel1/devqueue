'use client'
import { useEffect, useState } from 'react'
type Item = { id: number; title: string; objective: string; status: string; branch?: string; dependencies: string[]; priority: number }
export default function Page() {
  const [queue, setQueue] = useState<Item[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [objective, setObjective] = useState('')
  const [packet, setPacket] = useState<unknown>(null)
  async function request(url: string, method = 'GET', body?: unknown) {
    const response = await fetch(url, { method, cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    const payload = response.status === 204 ? {} : await response.json()
    if (!response.ok) throw new Error(payload.error ?? 'FeltDB request failed')
    return payload.data
  }
  async function refresh() { setQueue(await request('/api/queue')) }
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)) }, [])
  async function perform(action: () => Promise<void>) {
    setBusy(true); setError('')
    try { await action(); await refresh() } catch (e) { setError(e instanceof Error ? e.message : 'Request failed') } finally { setBusy(false) }
  }
  return <main className="page-content" style={{ maxWidth: 1100, margin: 'auto' }}>
    <div className="page-heading"><div><div className="eyebrow">DEV QUEUE · FELTDB</div><h1>Development control plane</h1><p>Persisted human-defined order. Deterministic dependency resolution. External coding workers.</p></div><button className="primary-button" disabled={busy || loading || !queue.length} onClick={() => perform(async () => { const result = await request('/api/runner/next', 'POST', { projectId: 'default-project' }); setPacket(result); if (!result) setError('No executable PR: check status and dependencies.') })}>Build next TaskPacket</button></div>
    {error && <p role="alert" className="attention-banner">{error}</p>}
    <section className="panel" style={{ padding: 24, marginBottom: 24 }}><h2>Create work</h2><form onSubmit={e => { e.preventDefault(); perform(async () => { await request('/api/queue', 'POST', { title, objective }); setTitle(''); setObjective('') }) }} style={{ display: 'grid', gap: 12 }}><label>Title <input required value={title} onChange={e => setTitle(e.target.value)} /></label><label>Objective <textarea required value={objective} onChange={e => setObjective(e.target.value)} /></label><button className="secondary-button" disabled={busy || loading}>Create PR</button></form></section>
    <section className="queue-panel panel"><div className="panel-heading"><h2>Persisted queue · {queue.length} PRs</h2><button disabled={busy} onClick={() => perform(refresh)}>Refresh</button></div>{loading ? <p>Loading FeltDB…</p> : !queue.length ? <p style={{ padding: 24 }}>No persisted PRs. Create work to begin. No sample data is inserted.</p> : queue.map((item, index) => <div className="queue-row" key={item.id}><span className="pr-number">#{item.id}</span><div className="queue-main"><strong>{item.title}</strong><span>{item.objective}</span><span>Dependencies: {item.dependencies.join(', ') || 'none'}</span></div><span className={`status-pill ${item.status}`}>{item.status}</span><button disabled={busy || index === 0} onClick={() => perform(async () => { await request(`/api/queue/${item.id}`, 'PATCH', { action: 'reorder', direction: 'up' }) })}>↑</button><button disabled={busy || index === queue.length - 1} onClick={() => perform(async () => { await request(`/api/queue/${item.id}`, 'PATCH', { action: 'reorder', direction: 'down' }) })}>↓</button><button disabled={busy || ['running','waiting'].includes(item.status)} onClick={() => { if (confirm(`Delete PR #${item.id}?`)) perform(async () => { await request(`/api/queue/${item.id}`, 'DELETE') }) }}>Delete</button></div>)}</section>
    {packet !== null && <section className="panel" style={{ padding: 24, marginTop: 24 }}><h2>Server-generated TaskPacket</h2><p>Admitted durably. Awaiting an external execution provider; no worker execution or acceptance results are fabricated.</p><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(packet, null, 2)}</pre></section>}
  </main>
}
