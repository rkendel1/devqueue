export type TaskPacket = { taskId: string; sessionId: string; project: { repositoryPath: string; name: string; goal: string }; pr: Record<string, unknown>; previousDecisions: unknown[]; workerContract: Record<string, unknown> }
export type WorkerStatus = 'disconnected'|'idle'|'running'|'waiting'|'completed'|'failed'
export type Decision = { question: string; answer: string }
export interface CodingWorker {
 connect(): Promise<void>
 startTask(task: TaskPacket): Promise<void>
 getStatus(): Promise<WorkerStatus>
 sendDecision(decision: Decision): Promise<void>
 stopTask(): Promise<void>
}
export interface DecisionReceiver { waitForDecision(sessionId: string): Promise<Decision> }
