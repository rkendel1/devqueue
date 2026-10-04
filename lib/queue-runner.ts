// Worker admission is exclusively authenticated through the worker protocol.
export async function runNext(_projectId: string): Promise<null> { throw new Error('Use authenticated POST /api/worker-sessions/claim-next') }
