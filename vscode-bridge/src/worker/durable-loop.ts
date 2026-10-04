import {createFeltDB, StateFirstDB} from '@feltdb/core'
import {randomUUID} from 'node:crypto'
import {HttpDevQueueClient, Session} from '../dev-queue-client/client'
export type Outgoing={id:string;order:number;sessionId:string;action:string;body:Record<string,unknown>;state:'pending'|'acknowledged';createdAt:string;acknowledgedAt?:string}
export type Binding={id:string;endpoint:string;sessionId:string}
// FeltDB is the only outbox persistence engine. No JSON queue or globalState evidence.
export class DurableWorkerLoop {
 private flushing=false
 private timer:ReturnType<typeof setInterval>|undefined
 private connected=false
 constructor(private db:StateFirstDB,private api:HttpDevQueueClient,private sessionId:string){}
 static open(path:string){return createFeltDB({namespace:'dev-queue-bridge',mode:'local',path})}
 async bind(endpoint:string){await this.db.collection<Binding>('BridgeBinding').insert({id:this.sessionId,endpoint,sessionId:this.sessionId},this.sessionId)}
 async inspect():Promise<Session>{return this.api.inspect(this.sessionId)}
 async enqueue(action:string,body:Record<string,unknown>,id=randomUUID()){
  const table=this.db.collection<Outgoing>('BridgeOutbox'),existing=await table.get(id)
  if(existing){if(existing.sessionId!==this.sessionId||existing.action!==action||JSON.stringify(existing.body)!==JSON.stringify(body))throw new Error('outbox_identity_conflict');return id}
  const basis=await this.db.readBasis({predicates:[{collection:'BridgeOutbox',where:[{field:'sessionId',eq:this.sessionId}]}]})
  const all=await table.find({sessionId:this.sessionId}),order=Math.max(0,...all.map(i=>i.order))+1
  await this.db.transaction({fences:[basis],operations:[{collection:'BridgeOutbox',id,requireAbsent:true,value:{id,order,sessionId:this.sessionId,action,body,state:'pending',createdAt:new Date().toISOString()}}]})
  return id
 }
 async flush(){
  if(this.flushing)return
  this.flushing=true
  try{
   const pending=(await this.db.collection<Outgoing>('BridgeOutbox').find({sessionId:this.sessionId})).filter(i=>i.state==='pending').sort((a,b)=>a.order-b.order)
   for(const item of pending){
    // Stable body/id retained on timeout or lost acknowledgement. Stop on first failure.
    await this.api.deliver(item.sessionId,item.action,item.body,item.id)
    await this.db.collection<Outgoing>('BridgeOutbox').update(item.id,{state:'acknowledged',acknowledgedAt:new Date().toISOString()})
   }
  }finally{this.flushing=false}
 }
 async reconnect(){
  const session=await this.inspect()
  this.disconnect()
  if(['completed','failed'].includes(session.status))throw new Error('session_terminal_inspect_only')
  this.connected=true
  await this.flush() // Explicit reconnect drains previous evidence, never claims/restarts coding.
  if(session.stopRequestedAt)return session
  await this.enqueue('heartbeat',{});await this.flush()
  this.timer=setInterval(()=>{if(this.connected)this.enqueue('heartbeat',{}).then(()=>this.flush()).catch(()=>{this.disconnect()})},15000)
  return session
 }
 disconnect(){this.connected=false;if(this.timer)clearInterval(this.timer);this.timer=undefined}
 async requestStop(){this.disconnect();await this.enqueue('stop',{});await this.flush()}
 async acknowledgeTermination(){await this.enqueue('stop-ack',{});await this.flush()}
 async consumeDecision(decisionId:string){await this.enqueue('decision-ack',{decisionId});await this.flush()}
}
