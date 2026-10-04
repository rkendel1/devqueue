const test=require('node:test'),assert=require('node:assert/strict')
const {mkdtemp,rm}=require('node:fs/promises'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {DurableWorkerLoop}=require('../dist/worker/durable-loop')
test('continuous transport heartbeat stops and concurrent evidence drains once',async()=>{
 const path=await mkdtemp(join(tmpdir(),'dq-heartbeat-')),db=DurableWorkerLoop.open(join(path,'db'));let deliveries=[]
 const api={inspect:async()=>({id:'s',status:'running'}),deliver:async(id,action,body,key)=>{deliveries.push({action,key});await new Promise(r=>setTimeout(r,5))}}
 const loop=new DurableWorkerLoop(db,api,'s')
 try{await loop.reconnect(25);await new Promise(r=>setTimeout(r,90));loop.disconnect();await new Promise(r=>setTimeout(r,30));const count=deliveries.length;await new Promise(r=>setTimeout(r,70));assert.equal(deliveries.length,count);assert.ok(count>=3)
 await Promise.all([loop.enqueue('events',{message:'A'},'event-a-0001'),loop.enqueue('events',{message:'B'},'event-b-0001')]);await Promise.all([loop.flush(),loop.flush()]);assert.equal(deliveries.filter(d=>d.key==='event-a-0001').length,1);assert.equal(deliveries.filter(d=>d.key==='event-b-0001').length,1)
 const rows=await db.collection('BridgeOutbox').find();assert.equal(new Set(rows.map(r=>r.order)).size,rows.length)
 }finally{loop.disconnect();await db.close();await rm(path,{recursive:true,force:true})}
})
