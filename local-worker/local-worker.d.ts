import type {CodingWorker,TaskPacket,WorkerStatus,Decision} from '../vscode-bridge/src/worker/contracts'
/** Restricted disposable fixture implementation of the shared worker contract. */
export class LocalWorker implements CodingWorker {
 constructor(endpoint:string,token:string,workspace:string,options?:{outboxPath?:string;heartbeatMs?:number})
 connect():Promise<void>
 startTask(packet:TaskPacket):Promise<void>
 getStatus():Promise<WorkerStatus>
 sendDecision(decision:Decision):Promise<void>
 stopTask():Promise<void>
 close():Promise<void>
 claim(projectId:string):Promise<{session:{id:string};taskPacket:TaskPacket}>
 reconnect(sessionId:string):Promise<{taskPacket:TaskPacket;status:string}>
}
