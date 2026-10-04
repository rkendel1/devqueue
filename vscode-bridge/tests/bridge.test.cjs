const test=require('node:test'),assert=require('node:assert/strict')
const {mkdtemp,rm,mkdir}=require('node:fs/promises'),{tmpdir}=require('node:os'),{join}=require('node:path')
const {verifyWorkspace}=require('../dist/worker/workspace')
const {ClineWorker}=require('../dist/cline/cline-worker')
const {HttpDevQueueClient}=require('../dist/dev-queue-client/client')
test('real filesystem workspace match and wrong/multi-root rejection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'bridge-workspace-'));try{
 await mkdir(join(root,'other'));assert.equal(await verifyWorkspace(root,[root]),root)
 await assert.rejects(verifyWorkspace(root,[join(root,'other')]),/mismatch/)
 await assert.rejects(verifyWorkspace(root,[root,join(root,'other')]),/unambiguous/)
 }finally{await rm(root,{recursive:true,force:true})}
})
test('Cline control remains disabled, never reports execution',async()=>{const worker=new ClineWorker();assert.equal(await worker.getStatus(),'disconnected');await assert.rejects(worker.connect(),/audit required/);await assert.rejects(worker.startTask({}),/unavailable/)})
test('missing credential fails before network and insecure remote transport refused',async()=>{
 assert.throws(()=>new HttpDevQueueClient('http://example.com',async()=>undefined),/HTTPS/)
 assert.throws(()=>new HttpDevQueueClient('https://user:secret@example.com',async()=>undefined),/credentials/)
 const client=new HttpDevQueueClient('http://127.0.0.1:3000',async()=>undefined)
 await assert.rejects(client.claimNext({},'request-key-0001'),/credential missing/)
})
test('HTTP client preserves authoritative packet and explicit retry identity; invalid token fails closed',async()=>{
 const http=require('node:http');let observed=[]
 const packet={sessionId:'session-a',taskId:'task-a',project:{repositoryPath:'/fixture',goal:'exact'},pr:{specification:'Do not rewrite'}}
 const server=http.createServer((request,response)=>{
 let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
 observed.push({path:request.url,authorization:request.headers.authorization,key:request.headers['idempotency-key'],body})
 response.setHeader('content-type','application/json')
 if(request.headers.authorization!=='Bearer test-worker-only'){response.statusCode=401;response.end(JSON.stringify({error:'unauthenticated'}));return}
 response.end(JSON.stringify({data:{session:{id:'session-a',status:'claimed'},taskPacket:packet}}))
 })})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
 const endpoint=`http://127.0.0.1:${server.address().port}`
 const client=new HttpDevQueueClient(endpoint,async()=>'test-worker-only'),input={projectId:'p',workerType:'adapter',workspacePath:'/fixture'}
 assert.deepEqual((await client.claimNext(input,'stable-request-0001')).taskPacket,packet)
 await client.claimNext(input,'stable-request-0001')
 assert.deepEqual(observed[0],observed[1]);assert.equal(observed[0].path,'/api/worker-sessions/claim-next')
 await assert.rejects(new HttpDevQueueClient(endpoint,async()=>'invalid').inspect('session-a'),/401/)
 }finally{await new Promise(resolve=>server.close(resolve))}
})
