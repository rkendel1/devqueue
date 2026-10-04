'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  GitBranch,
  GripVertical,
  LayoutDashboard,
  ListChecks,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  Settings2,
  Square,
  Terminal,
  Zap,
} from 'lucide-react'

type Status = 'running' | 'queued' | 'waiting' | 'done' | 'failed'

type QueueItem = {
  id: number
  title: string
  objective: string
  status: Status
  dependency?: string
  branch: string
  elapsed?: string
  worker?: string
}

const initialQueue: QueueItem[] = [
  { id: 16, title: 'Chip integration', objective: 'Integrate Chip as the configured Compute worker.', status: 'running', branch: 'dev-queue/pr-16', elapsed: '12m 34s', worker: 'Cline' },
  { id: 17, title: 'Portable release workflow', objective: 'Prepare the release path for portable execution.', status: 'queued', dependency: '#16 Chip integration', branch: 'dev-queue/pr-17' },
  { id: 18, title: 'Linux verification', objective: 'Verify the runtime across supported Linux targets.', status: 'queued', branch: 'dev-queue/pr-18' },
  { id: 19, title: 'Service gateway cleanup', objective: 'Remove duplicate gateway setup and preserve the contract.', status: 'waiting', dependency: 'Human decision required', branch: 'dev-queue/pr-19' },
  { id: 20, title: 'Document worker contract', objective: 'Document the bridge protocol and completion events.', status: 'done', branch: 'dev-queue/pr-20' },
]

const statusCopy: Record<Status, string> = { running: 'Running', queued: 'Queued', waiting: 'Waiting', done: 'Done', failed: 'Failed' }

function StatusPill({ status }: { status: Status }) {
  return <span className={`status-pill ${status}`}><span className="status-dot" />{statusCopy[status]}</span>
}

export default function Page() {
  const [queue, setQueue] = useState(initialQueue)
  const [selectedId, setSelectedId] = useState(16)
  const [isQueueRunning, setIsQueueRunning] = useState(true)
  const [attentionOpen, setAttentionOpen] = useState(true)
  const [toast, setToast] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeView, setActiveView] = useState('Overview')
  const [nextId, setNextId] = useState(21)

  function notify(message: string) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2200)
  }

  async function refreshQueue() {
    const response = await fetch('/api/queue', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unable to load queue')
    const payload = await response.json()
    setQueue(payload.data)
    const highestId = payload.data.reduce((max: number, item: QueueItem) => Math.max(max, item.id), 20)
    setNextId(highestId + 1)
  }

  useEffect(() => {
    refreshQueue().catch(() => notify('Unable to load queue data'))
  }, [])

  const filteredQueue = queue.filter((item) => `${item.title} ${item.objective} ${item.id}`.toLowerCase().includes(searchQuery.toLowerCase()))
  const selected = queue.find((item) => item.id === selectedId) ?? queue[0]
  const counts = useMemo(() => ({
    queued: queue.filter((item) => item.status === 'queued').length,
    running: queue.filter((item) => item.status === 'running').length,
    waiting: queue.filter((item) => item.status === 'waiting').length,
    done: queue.filter((item) => item.status === 'done').length,
  }), [queue])

  async function moveItem(id: number, direction: -1 | 1) {
    try {
      const response = await fetch(`/api/queue/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reorder', direction: direction === -1 ? 'up' : 'down' }) })
      if (!response.ok) throw new Error('Unable to reorder')
      await refreshQueue()
      notify(`PR #${id} priority updated`)
    } catch { notify('Unable to update priority') }
  }

  function runNext() {
    if (!isQueueRunning) {
      setToast('Start the queue before running a PR')
      window.setTimeout(() => setToast(''), 2200)
      return
    }
    const next = queue.find((item) => item.status === 'queued')
    if (!next) {
      setToast('No queued PRs are ready')
      window.setTimeout(() => setToast(''), 2200)
      return
    }
    fetch(`/api/queue/${next.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'running', worker: 'Cline', elapsed: '0m 02s' }) }).then(async (response) => { if (!response.ok) throw new Error(); await refreshQueue(); setSelectedId(next.id); notify(`Started PR #${next.id}`) }).catch(() => notify('Unable to start PR'))
  }

  function resolveAttention() {
    fetch('/api/queue/19', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'running', dependency: null, worker: 'Cline', elapsed: '0m 01s' }) }).then(async (response) => { if (!response.ok) throw new Error(); await refreshQueue() }).catch(() => notify('Unable to resolve attention item'))
    setAttentionOpen(false)
    setSelectedId(19)
    setToast('GPT decision approved. Worker resumed.')
    window.setTimeout(() => setToast(''), 2600)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Zap /></div><div><strong>dev queue</strong><span>control plane</span></div></div>
        <div className="workspace-switcher"><div className="workspace-icon">C</div><div><strong>Compute</strong><span>portable execution fabric</span></div><ChevronRight className="chevron" /></div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          {['Overview', 'PR Queue', 'Worker', 'Attention', 'Activity'].map((view) => <button key={view} className={`nav-item ${activeView === view ? 'active' : ''}`} onClick={() => { setActiveView(view); if (view === 'Attention') setAttentionOpen(true) }}><span>{view === 'Overview' ? <LayoutDashboard /> : view === 'PR Queue' ? <ListChecks /> : view === 'Worker' ? <Radio /> : view === 'Attention' ? <Bell /> : <Clock3 />}</span>{view}{view === 'PR Queue' && <span className="nav-count">{queue.length}</span>}{view === 'Worker' && <span className="nav-live">LIVE</span>}{view === 'Attention' && counts.waiting > 0 && <span className="nav-alert">{counts.waiting}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom"><button className="nav-item"><Settings2 />Settings</button><div className="bridge-card"><div className="bridge-status"><span className="pulse" />Bridge connected</div><span>VS Code · /src/compute</span><button>Manage bridge <ChevronRight /></button></div><div className="user-row"><div className="avatar">RA</div><div><strong>Randy Anderson</strong><span>Local workspace</span></div><MoreHorizontal /></div></div>
      </aside>

      <section className="content-area">
        <header className="topbar"><div className="crumbs"><span>Projects</span><ChevronRight /><strong>Compute</strong></div><div className="top-actions"><div className="search"><Search /><input aria-label="Search queue" placeholder="Search queue" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} /></div><button className="icon-button" aria-label="Notifications"><Bell /><span className="notification-dot" /></button><button className="avatar small">RA</button></div></header>
        <div className="page-content">
          <div className="page-heading"><div><div className="eyebrow"><span className="live-dot" />AUTONOMOUS QUEUE</div><h1>Good morning, Randy.</h1><p>Here&apos;s what&apos;s moving through Compute today.</p></div><div className="heading-actions"><button className="secondary-button" onClick={async () => { const id = nextId; try { const response = await fetch('/api/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: `New queue item ${id}`, objective: 'Define the implementation objective for this pull request.', branch: `dev-queue/pr-${id}` }) }); if (!response.ok) throw new Error(); await refreshQueue(); setSelectedId(id); notify(`PR #${id} added to the queue`) } catch { notify('Unable to add PR') } }}><Plus />New PR</button><button className="primary-button" onClick={runNext}><Play />Run next</button></div></div>

          <div className="stats-grid"><div className="stat-card"><span className="stat-label">Queue health</span><strong className="stat-value">{counts.queued + counts.running + counts.waiting}<small> active</small></strong><span className="stat-meta green"><CircleDot /> On track</span></div><div className="stat-card"><span className="stat-label">Running now</span><strong className="stat-value">{counts.running}<small> worker</small></strong><span className="stat-meta"><Terminal /> Cline · 12m 34s</span></div><div className="stat-card attention-stat"><span className="stat-label">Needs attention</span><strong className="stat-value">{counts.waiting}<small> item</small></strong><span className="stat-meta amber"><AlertTriangle /> Review required</span></div><div className="stat-card"><span className="stat-label">Completed</span><strong className="stat-value">{counts.done}<small> this week</small></strong><span className="stat-meta"><Check /> 92% gate pass rate</span></div></div>

          {attentionOpen && <section className="attention-banner"><div className="attention-icon"><AlertTriangle /></div><div className="attention-copy"><div><strong>1 item needs your attention</strong><span>PR #19 · Service gateway cleanup</span></div><p>Cline is blocked on an architectural decision. GPT recommends preserving the existing service contract.</p></div><div className="attention-actions"><button className="text-button" onClick={() => setSelectedId(19)}>View question <ChevronRight /></button><button className="approve-button" onClick={resolveAttention}>Approve decision <Check /></button></div></section>}

          <div className="dashboard-grid"><section className="queue-panel panel"><div className="panel-heading"><div><div className="section-kicker"><span className="live-dot" />LIVE QUEUE</div><h2>PR queue <span>· {queue.length} PRs</span></h2></div><div className="queue-controls"><button className={isQueueRunning ? 'control-button running' : 'control-button'} onClick={() => setIsQueueRunning((value) => !value)}>{isQueueRunning ? <Pause /> : <Play />}{isQueueRunning ? 'Pause' : 'Start'} queue</button><button className="icon-button"><MoreHorizontal /></button></div></div><div className="queue-list">{filteredQueue.map((item, index) => <div className={`queue-row ${selectedId === item.id ? 'selected' : ''}`} key={item.id} role="button" tabIndex={0} onClick={() => setSelectedId(item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(item.id) }}><span className="drag-handle"><GripVertical /></span><span className="pr-number">#{item.id}</span><span className="queue-main"><strong>{item.title}</strong><span>{item.objective}</span>{item.dependency && <em><GitBranch /> {item.dependency}</em>}</span><span className="queue-row-right"><StatusPill status={item.status} /><span className="row-actions"><button aria-label={`Move PR ${item.id} up`} onClick={(event) => { event.stopPropagation(); moveItem(item.id, -1) }} disabled={index === 0}><ArrowUp /></button><button aria-label={`Move PR ${item.id} down`} onClick={(event) => { event.stopPropagation(); moveItem(item.id, 1) }} disabled={index === filteredQueue.length - 1}><ArrowDown /></button></span></span></div>)}</div><button className="view-all" onClick={() => { setSearchQuery(''); setToast('Showing all PRs'); window.setTimeout(() => setToast(''), 1800) }}>View all PRs <ChevronRight /></button></section>

            <aside className="detail-panel panel"><div className="detail-top"><span className="section-kicker">CURRENTLY RUNNING</span><StatusPill status={selected.status} /></div><div className="detail-title"><span className="detail-pr">PR #{selected.id}</span><h2>{selected.title}</h2><p>{selected.objective}</p></div><div className="worker-card"><div className="worker-icon"><Code2 /></div><div><strong>{selected.worker ?? 'Cline'}</strong><span>{selected.status === 'running' ? `Working for ${selected.elapsed}` : 'Ready to execute'}</span></div><span className="worker-live"><span className="pulse" />Live</span></div><div className="progress-block"><div className="progress-label"><span>Acceptance gates</span><strong>{selected.status === 'done' ? '4 / 4' : '2 / 4'}</strong></div><div className="progress-track"><span style={{ width: selected.status === 'done' ? '100%' : '54%' }} /></div><div className="gate-list"><span><Check /> Typecheck</span><span><Check /> Unit tests</span><span className={selected.status === 'done' ? 'complete' : ''}><CircleDot /> Runtime verification</span><span><CircleDot /> No unrelated changes</span></div></div><div className="detail-footer"><span><GitBranch /> {selected.branch}</span><div className="detail-actions"><button className="text-button" onClick={() => notify('Public API: GET /api/queue/' + selected.id)}>Open details <ChevronRight /></button><button className="text-button danger" onClick={async () => { if (!window.confirm(`Delete PR #${selected.id}?`)) return; const response = await fetch(`/api/queue/${selected.id}`, { method: 'DELETE' }); if (response.ok) { await refreshQueue(); setSelectedId(queue.find((item) => item.id !== selected.id)?.id ?? 16); notify(`PR #${selected.id} deleted`) } else notify('Unable to delete PR') }}>Delete</button></div></div></aside></div>

          <section className="activity-panel panel"><div className="panel-heading"><div><div className="section-kicker">RECENT ACTIVITY</div><h2>What&apos;s happening</h2></div><button className="text-button">View activity <ChevronRight /></button></div><div className="activity-list"><div className="activity-item"><span className="activity-icon green"><Check /></span><div><strong>Acceptance gates passed</strong><span>PR #15 · Atomic runtime payload</span></div><time>2 min ago</time></div><div className="activity-item"><span className="activity-icon blue"><Radio /></span><div><strong>Worker resumed</strong><span>PR #16 · Chip integration</span></div><time>8 min ago</time></div><div className="activity-item"><span className="activity-icon amber"><AlertTriangle /></span><div><strong>GPT decision recorded</strong><span>PR #19 · Service gateway cleanup</span></div><time>14 min ago</time></div><div className="activity-item"><span className="activity-icon purple"><Play /></span><div><strong>Started PR #16</strong><span>Cline connected to /src/compute</span></div><time>20 min ago</time></div></div></section>
        </div>
      </section>
      {toast && <div className="toast"><Check />{toast}</div>}
    </main>
  )
}
