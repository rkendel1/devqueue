import { CodingWorker, TaskPacket, Decision, WorkerStatus } from '../worker/contracts'
// No supported installed Cline API has been audited. Never guess commands.
export class ClineWorker implements CodingWorker {
 async connect(): Promise<void> { throw new Error('Cline adapter disabled: installed extension API audit required') }
 async startTask(_task: TaskPacket): Promise<void> { throw new Error('Cline task invocation unavailable') }
 async getStatus(): Promise<WorkerStatus> { return 'disconnected' }
 async sendDecision(_decision: Decision): Promise<void> { throw new Error('Cline decision channel unavailable') }
 async stopTask(): Promise<void> { throw new Error('Cline stop capability unavailable; inspect worker manually') }
}
