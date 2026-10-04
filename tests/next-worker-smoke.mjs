import { createRequire } from 'node:module'
// Real Next.js process + real FeltDB file persistence; no production fake worker.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { FileJsDb } from '@feltdb/core/file-db'
import { StateFirstDB } from '@feltdb/core/db'
const dir=mkdtempSync(join(tmpdir(),'next-worker-')), path=join(dir,'state')
const token=randomBytes(32).toString('hex'),humanToken=randomBytes(32).toString('hex')
const runtime=new FileJsDb(path), db=new StateFirstDB(runtime), timestamp=new Date().toISOString()
await db.collection('Project').insert({id:'p',name:'Smoke',goal:'Protocol',repositoryPath:'/test',defaultBranch:'main',createdAt:timestamp,updatedAt:timestamp},'p')
await db.collection('PR').insert({id:'pr1',projectId:'p',number:1,title:'Smoke',objective:'Restart',specification:'Real persistence',acceptanceCriteria:['gate'],constraints:[],dependencies:[],priority:0,status:'queued',createdAt:timestamp,updatedAt:timestamp},'pr1')
runtime.close()
let child
const base='http://127.0.0.1:3187'
async function start(production=false){
 child=spawn(process.execPath,['node_modules/next/dist/bin/next',production?'start':'dev','--hostname','127.0.0.1','--port','3187'],{env:{...process.env,NODE_ENV:production?'production':'development',DEV_QUEUE_LOCAL_AUTH:'enabled',DEV_QUEUE_LOCAL_HUMAN_TOKEN:humanToken,DEV_QUEUE_LOCAL_DATA_PATH:path,DEV_QUEUE_WORKER_TOKEN:token},stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',()=>{});child.stderr.on('data',()=>{})
 for(let i=0;i<120;i++){if(child.exitCode!==null)throw new Error('Next process exited');try{await fetch(base);return}catch{await new Promise(r=>setTimeout(r,500))}}
 throw new Error('Next startup timeout')
}
async function stop(){if(child && child.exitCode===null){child.kill('SIGTERM');await once(child,'exit')}}
async function call(route,body,key){const response=await fetch(base+route,{method:body?'POST':'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':key??'smoke-key-0001'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,JSON.stringify(data));return data.data}
try{
 await start()
 const anonymous=await fetch(base+'/api/worker-sessions/missing');assert.equal(anonymous.status,401)
 const forbidden=await fetch(base+'/api/projects',{headers:{authorization:`Bearer ${token}`}});assert.equal(forbidden.status,403)
 const ready=await call('/api/worker-sessions/readiness?projectId=p');assert.equal(ready.workerId,'local-worker');assert.equal(ready.authorized,true)
 const missingProject=await fetch(base+'/api/queue',{headers:{}});assert.equal(missingProject.status,400)
 const absentProject=await fetch(base+'/api/queue?projectId=absent',{headers:{}});assert.equal(absentProject.status,404)
 const wrongGrant=await fetch(base+'/api/worker-sessions/readiness?projectId=other',{headers:{authorization:`Bearer ${token}`}});assert.equal(wrongGrant.status,403)
 const result=await call('/api/worker-sessions/claim-next',{projectId:'p',workerType:'test-only',workspacePath:'/test'})
 const id=result.session.id
 const require=createRequire(import.meta.url)
 const {DurableWorkerLoop}=require('../vscode-bridge/dist/worker/durable-loop.js')
 const {HttpDevQueueClient}=require('../vscode-bridge/dist/dev-queue-client/client.js')
 let outboxDb=DurableWorkerLoop.open(join(dir,'bridge-outbox'))
 const api=new HttpDevQueueClient(base,async()=>token)
 let lost=true
 const transport={inspect:api.inspect.bind(api),deliver:async(...args)=>{const response=await api.deliver(...args);if(lost){lost=false;throw new Error('lost response after server committed')}return response}}
 let bridge=new DurableWorkerLoop(outboxDb,transport,id)
 await bridge.bind(base)
 await bridge.enqueue('heartbeat',{},'outbox-heartbeat-0001')
 await assert.rejects(bridge.flush(),/lost response/)
 await outboxDb.close()
 outboxDb=DurableWorkerLoop.open(join(dir,'bridge-outbox'))
 bridge=new DurableWorkerLoop(outboxDb,transport,id)
 await bridge.flush()
 assert.equal((await outboxDb.collection('BridgeOutbox').get('outbox-heartbeat-0001')).state,'acknowledged')
 await outboxDb.close()
 await call(`/api/worker-sessions/${id}/heartbeat`,{},'heartbeat-0001')
 await call(`/api/worker-sessions/${id}/events`,{type:'started',message:'Started'},'started-0001')
 await call(`/api/worker-sessions/${id}/events`,{type:'progress',message:'Progress'},'progress-0001')
 await call(`/api/worker-sessions/${id}/question`,{message:'Durable question?'},'question-0001')
 await stop();await start()
 const restored=await call(`/api/worker-sessions/${id}`)
 assert.equal(restored.status,'waiting');assert.equal(restored.currentQuestion,'Durable question?');assert.equal(restored.taskPacket.sessionId,id)
 await stop()
 const inspect=new FileJsDb(path), durable=new StateFirstDB(inspect)
 assert.equal((await durable.collection('PR').get('pr1')).status,'waiting')
 assert.equal((await durable.collection('WorkerEvent').find({sessionId:id})).length,5)
 inspect.close()
 await start(true)
 const answer=await fetch(base+'/api/local-actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'answer',sessionId:id,answer:'Use existing implementation'})})
 assert.equal(answer.status,200)
 const decisions=await call(`/api/worker-sessions/${id}/decisions`)
 assert.equal(decisions[0].answer,'Use existing implementation')
 const resumed=await call(`/api/worker-sessions/${id}`);assert.equal(resumed.status,'running')
 await call(`/api/worker-sessions/${id}/decision-ack`,{decisionId:decisions[0].id},'decision-ack-0001')
 const reconnectDb=DurableWorkerLoop.open(join(dir,'bridge-outbox'))
 const reconnect=new DurableWorkerLoop(reconnectDb,api,id)
 await reconnect.reconnect();reconnect.disconnect()
 assert.equal((await reconnectDb.collection('BridgeBinding').find()).length,1)
 await reconnect.requestStop()
 const fenced=await fetch(base+`/api/worker-sessions/${id}/heartbeat`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json','idempotency-key':'fenced-heartbeat-0001'},body:'{}'});assert.equal(fenced.status,409)
 await reconnectDb.close()
 const wrongOrigin=await fetch(base+'/api/projects',{headers:{origin:'https://untrusted.example'}});assert.equal(wrongOrigin.status,403)
 console.log('PASS: authenticated Next worker protocol, process restart, durable evidence, ownership boundary, local answer/resume and origin safety')
}finally{await stop();rmSync(dir,{recursive:true,force:true})}
