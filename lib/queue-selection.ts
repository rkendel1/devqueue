export type Candidate = { id: string; number: number; priority: number; status: string; dependencies: string[] }
export function selectNext<T extends Candidate>(items: T[]): T | null {
  const ordered = [...items].sort((a, b) => a.priority - b.priority || a.number - b.number || a.id.localeCompare(b.id))
  return ordered.find(pr => pr.status === 'queued' && pr.dependencies.every(dep => {
    const target = ordered.find(other => other.id === dep || String(other.number) === dep || `#${other.number}` === dep)
    return target?.status === 'done'
  })) ?? null
}
