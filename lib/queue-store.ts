export type QueueStatus = 'running' | 'queued' | 'waiting' | 'done' | 'failed'

export type QueueItem = {
  id: number
  title: string
  objective: string
  status: QueueStatus
  dependency?: string
  branch: string
  elapsed?: string
  worker?: string
  createdAt: string
  updatedAt: string
}

const seed: Omit<QueueItem, 'createdAt' | 'updatedAt'>[] = [
  { id: 16, title: 'Chip integration', objective: 'Integrate Chip as the configured Compute worker.', status: 'running', branch: 'dev-queue/pr-16', elapsed: '12m 34s', worker: 'Cline' },
  { id: 17, title: 'Portable release workflow', objective: 'Prepare the release path for portable execution.', status: 'queued', dependency: '#16 Chip integration', branch: 'dev-queue/pr-17' },
  { id: 18, title: 'Linux verification', objective: 'Verify the runtime across supported Linux targets.', status: 'queued', branch: 'dev-queue/pr-18' },
  { id: 19, title: 'Service gateway cleanup', objective: 'Remove duplicate gateway setup and preserve the contract.', status: 'waiting', dependency: 'Human decision required', branch: 'dev-queue/pr-19' },
  { id: 20, title: 'Document worker contract', objective: 'Document the bridge protocol and completion events.', status: 'done', branch: 'dev-queue/pr-20' },
]

const now = () => new Date().toISOString()
const initial = seed.map((item) => ({ ...item, createdAt: now(), updatedAt: now() }))
const state = globalThis as typeof globalThis & { __devQueue?: QueueItem[] }
if (!state.__devQueue) state.__devQueue = initial

export function listQueue() { return state.__devQueue! }
export function createQueueItem(input: Pick<QueueItem, 'title' | 'objective'> & Partial<Pick<QueueItem, 'status' | 'dependency' | 'branch'>>) {
  const items = listQueue()
  const id = Math.max(0, ...items.map((item) => item.id)) + 1
  const timestamp = now()
  const item: QueueItem = { id, title: input.title, objective: input.objective, status: input.status ?? 'queued', dependency: input.dependency, branch: input.branch ?? `dev-queue/pr-${id}`, createdAt: timestamp, updatedAt: timestamp }
  items.push(item)
  return item
}
export function updateQueueItem(id: number, patch: Partial<Omit<QueueItem, 'id' | 'createdAt'>>) {
  const item = listQueue().find((entry) => entry.id === id)
  if (!item) return null
  Object.assign(item, patch, { updatedAt: now() })
  return item
}
export function deleteQueueItem(id: number) {
  const items = listQueue()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) return false
  items.splice(index, 1)
  return true
}
export function reorderQueue(id: number, direction: 'up' | 'down') {
  const items = listQueue()
  const index = items.findIndex((item) => item.id === id)
  const target = index + (direction === 'up' ? -1 : 1)
  if (index < 0 || target < 0 || target >= items.length) return null
  ;[items[index], items[target]] = [items[target], items[index]]
  return items
}
