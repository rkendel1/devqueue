const test=require('node:test'),assert=require('node:assert/strict')
const {mkdtemp,rm}=require('node:fs/promises'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {DurableWorkerLoop}=require('../dist/worker/durable-loop')
test('real FeltDB outbox survives reopen and lost acknowledgement with stable identity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'bridge-outbox-'))
 let db=DurableWorkerLoop.open(join(dir,'state')),delivered=new Map(),fail=true
 const api={inspect:async()=>({id:'session',status:'running'}),deliver:async(id,action,body,key)=>{const prior=delivered.get(key);if(prior)assert.deepEqual(prior,body);delivered.set(key,body);if(fail){fail=false;throw new Error('lost HTTP acknowledgement')}}}
 let loop=new DurableWorkerLoop(db,api,'session')
 try{
 await loop.bind('http://127.0.0.1:3000');await loop.enqueue('events',{type:'progress',message:'Observed'},'stable-event-0001')
 await assert.rejects(loop.flush(),/lost HTTP/)
 assert.equal((await db.collection('BridgeOutbox').get('stable-event-0001')).state,'pending')
 await db.close();db=DurableWorkerLoop.open(join(dir,'state'));loop=new DurableWorkerLoop(db,api,'session')
 assert.equal((await db.collection('BridgeBinding').get('session')).sessionId,'session')
 await loop.flush();assert.equal(delivered.size,1)
 assert.equal((await db.collection('BridgeOutbox').get('stable-event-0001')).state,'acknowledged')
 await assert.rejects(loop.enqueue('events',{type:'progress',message:'Changed'},'stable-event-0001'),/outbox_identity_conflict/)
 await loop.reconnect();loop.disconnect();assert.equal((await db.collection('BridgeBinding').find()).length,1)
 }finally{loop.disconnect();await db.close();await rm(dir,{recursive:true,force:true})}
})
