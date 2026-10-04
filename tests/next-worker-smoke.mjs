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
 child=spawn(process.execPath,['node_modules/next/dist/bin/next',production?'start':'dev','--hostname','127.0.0.1','--port','3187'],{env:{...process.env,NODE_ENV:production?'production':'development',DEV_QUEUE_LOCAL_AUTH:'enabled',DEV_QUEUE_LOCAL_HUMAN_TOKEN:humanToken,DEV_QUEUE_LOCAL_DATA_PATH:path,DEV_QUEUE_LOCAL_WORKERS:JSON.stringify([{id:'smoke-worker',token,projects:['p']}])},stdio:['ignore','pipe','pipe']})
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
 const ready=await call('/api/worker-sessions/readiness?projectId=p');assert.equal(ready.workerId,'smoke-worker');assert.equal(ready.authorized,true)
 const missingProject=await fetch(base+'/api/queue',{headers:{authorization:`Bearer ${humanToken}`}});assert.equal(missingProject.status,400)
 const absentProject=await fetch(base+'/api/queue?projectId=absent',{headers:{authorization:`Bearer ${humanToken}`}});assert.equal(absentProject.status,404)
 const wrongGrant=await fetch(base+'/api/worker-sessions/readiness?projectId=other',{headers:{authorization:`Bearer ${token}`}});assert.equal(wrongGrant.status,403)
 const result=await call('/api/worker-sessions/claim-next',{projectId:'p',workerType:'test-only',workspacePath:'/test'})
 const id=result.session.id
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
 assert.equal((await durable.collection('WorkerEvent').find({sessionId:id})).length,3)
 inspect.close()
 await start(true)
 const closed=await fetch(base+'/api/worker-sessions/claim-next',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:'{}'})
 assert.equal(closed.status,503)
 console.log('PASS: authenticated Next worker protocol, process restart, durable evidence, ownership boundary, production fail-closed')
}finally{await stop();rmSync(dir,{recursive:true,force:true})}
