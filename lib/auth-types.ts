export type WorkerPrincipal = { id: string; projects: string[] }
export class ProtocolError extends Error { constructor(public status: number, message: string) { super(message) } }
