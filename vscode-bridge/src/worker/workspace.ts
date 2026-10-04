import { realpath } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
export async function verifyWorkspace(repositoryPath: string, roots: string[]): Promise<string> {
 if (!isAbsolute(repositoryPath) || roots.length !== 1) throw new Error('REFUSED: exactly one unambiguous local workspace required')
 const [repository, workspace] = await Promise.all([realpath(repositoryPath), realpath(roots[0])])
 if (repository !== workspace) throw new Error('REFUSED: workspace mismatch')
 return workspace
}
