import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { FileJsDb } from '@feltdb/core/file-db'
import { StateFirstDB } from '@feltdb/core/db'
const compiled = mkdtempSync(join(tmpdir(), 'worker-protocol-code-'))
for (const name of ['worker-auth','worker-protocol','queue-selection','auth-types','human-auth','queue-store','local-boundary','local-actions']) {
  const source = readFileSync(`lib/${name}.ts`, 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll("'./queue-selection'", "'./queue-selection.mjs'").replaceAll("'./worker-auth'", "'./worker-auth.mjs'")
  let resolved=code
  for(const module of ['auth-types','human-auth','queue-store','local-boundary','local-actions'])resolved=resolved.replaceAll(`'./${module}'`,`'./${module}.mjs'`)
  for(const module of ['@feltdb/core','@feltdb/core/file-db'])resolved=resolved.replaceAll(`'${module}'`,JSON.stringify(import.meta.resolve(module)))
  writeFileSync(join(compiled, `${name}.mjs`), resolved)
}
const { WorkerProtocol } = await import(join(compiled, 'worker-protocol.mjs'))
const { workerAuthenticator } = await import(join(compiled, 'worker-auth.mjs'))
const A = { id: 'worker-a', projects: ['p'] }, B = { id: 'worker-b', projects: ['p'] }
class TestWorker {
  constructor(protocol, principal) { this.protocol = protocol; this.principal = principal; this.counter = 0 }
  async claim() { const result = await this.protocol.claim(this.principal, { projectId:'p',workerType:'test-only',workspacePath:'/test' }, `claim-${++this.counter}-000`); this.id = result.session.id; return result }
  async send(action, body = {}, key) { return this.protocol.act(this.principal, this.id, action, body, key ?? `request-${++this.counter}-000`) }
}
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'dev-queue-test-'))
  let runtime = new FileJsDb(join(directory, 'state'))
  let db = new StateFirstDB(runtime)
  const now = new Date().toISOString()
  await db.collection('Project').insert({ id:'p',name:'Test',goal:'Durable execution',repositoryPath:'/test',defaultBranch:'main',createdAt:now,updatedAt:now }, 'p')
  await db.collection('PR').insert({ id:'pr1',projectId:'p',number:1,title:'Task',objective:'Test',specification:'Original',acceptanceCriteria:['tests'],constraints:[],dependencies:[],priority:0,status:'queued',createdAt:now,updatedAt:now }, 'pr1')
  return { get db() { return db }, protocol: () => new WorkerProtocol(db), restart() { runtime.close(); runtime = new FileJsDb(join(directory, 'state')); db = new StateFirstDB(runtime) }, close() { runtime.close(); rmSync(directory,{recursive:true,force:true}) } }
}
test('durable lifecycle, immutable packet, restart, simulated decision, acceptance remains pending', async () => {
  const f = await fixture()
  try {
    const worker = new TestWorker(f.protocol(), A), claim = await worker.claim()
    assert.equal((await f.db.collection('PR').get('pr1')).status,'running')
    assert.equal(claim.taskPacket.sessionId, worker.id)
    await worker.send('events',{type:'started',message:'Started'})
    await worker.send('events',{type:'progress',message:'Inspecting'})
    await worker.send('heartbeat',{},'heartbeat-0001')
    await worker.send('question',{message:'Which approach?'},'question-0001')
    assert.equal((await f.db.collection('PR').get('pr1')).status,'waiting')
    await assert.rejects(worker.send('events',{type:'progress',message:'Not allowed'}), /session_waiting/)
    await f.db.collection('PR').update('pr1',{specification:'Changed after admission'})
    f.restart()
    const durable = await f.protocol().read(A,worker.id)
    assert.equal(durable.status,'waiting')
    assert.equal(durable.currentQuestion,'Which approach?')
    assert.equal(durable.taskPacket.pr.specification,'Original')
    assert.equal((await f.db.collection('WorkerEvent').find({sessionId:worker.id})).length,4)
    // Test-only simulated human decision. No production answer/approval endpoint.
    await f.db.transaction({operations:[
      {collection:'WorkerSession',id:worker.id,value:{...durable,status:'running',currentQuestion:''}},
      {collection:'PR',id:'pr1',value:{...await f.db.collection('PR').get('pr1'),status:'running',currentQuestion:''}},
    ]})
    worker.protocol = f.protocol()
    await worker.send('events',{type:'progress',message:'Resumed'})
    await worker.send('result',{result:'PASS',summary:'Worker says success'})
    const complete = await worker.send('complete',{},'complete-0001')
    assert.equal(complete.status,'completion_pending_acceptance')
    assert.equal((await f.db.collection('PR').get('pr1')).status,'running')
    assert.equal((await f.protocol().read(A,worker.id)).status,'running')
    const replay = await worker.send('complete',{},'complete-0001')
    assert.deepEqual(replay,complete)
  } finally { f.close() }
})
test('concurrent claims: exactly one durable session', async () => {
  const f=await fixture(); try {
    const results=await Promise.allSettled([new TestWorker(f.protocol(),A).claim(),new TestWorker(f.protocol(),B).claim()])
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1)
    assert.equal((await f.db.collection('WorkerSession').find()).length,1)
  } finally { f.close() }
})
test('ownership, idempotency, concurrent event sequence and durable failure',async()=>{
  const f=await fixture(); try {
    const w=new TestWorker(f.protocol(),A);await w.claim()
    await assert.rejects(f.protocol().read(B,w.id), /session_forbidden/)
    for(const action of ['events','complete']) await assert.rejects(f.protocol().act(B,w.id,action,{type:'progress',message:'bad'},'forbidden-0001'),/session_forbidden/)
    await w.send('events',{type:'started',message:'Started'},'started-0001')
    await w.send('events',{type:'started',message:'Started'},'started-0001')
    assert.equal((await f.db.collection('WorkerEvent').find()).length,1)
    await assert.rejects(w.send('events',{type:'started',message:'Different'},'started-0001'),/idempotency_key_reused/)
    const results=await Promise.allSettled([w.send('events',{type:'progress',message:'A'},'progress-0001'),w.send('events',{type:'progress',message:'B'},'progress-0002')])
    for(let i=0;i<results.length;i++) if(results[i].status==='rejected') await w.send('events',{type:'progress',message:i===0?'A':'B'},`progress-000${i+1}`)
    const events=await f.db.collection('WorkerEvent').find()
    assert.deepEqual(events.map(e=>e.sequence).sort(),[1,2,3])
    await w.send('fail',{message:'Test error'},'failure-0001')
    f.restart()
    assert.equal((await f.protocol().read(A,w.id)).status,'failed')
    assert.equal((await f.db.collection('PR').get('pr1')).status,'failed')
    await assert.rejects(f.protocol().act(A,w.id,'events',{type:'progress',message:'after failure'},'afterfail-0001'),/session_terminal/)
  }finally{f.close()}
})
test('arbitrary claim rejected and local missing-token authentication fails closed',async()=>{
  const f=await fixture();try{
    await assert.rejects(f.protocol().claim(A,{projectId:'p',prId:'wrong',workerType:'test',workspacePath:'/test'},'claimbad-0001'),/not_next_executable_pr/)
    const previous=process.env.DEV_QUEUE_WORKER_TOKEN;delete process.env.DEV_QUEUE_WORKER_TOKEN
    try{await assert.rejects(workerAuthenticator.authenticate(new Request('http://localhost')),/local_worker_token_required/)}finally{if(previous===undefined)delete process.env.DEV_QUEUE_WORKER_TOKEN;else process.env.DEV_QUEUE_WORKER_TOKEN=previous}
  }finally{f.close()}
})
test('two real sessions reject cross-session read, append and completion',async()=>{
 const f=await fixture();try{
  const A2={id:A.id,projects:['p','q']},B2={id:B.id,projects:['p','q']}
  await f.db.collection('Project').insert({...await f.db.collection('Project').get('p'),id:'q'},'q')
  await f.db.collection('PR').insert({...await f.db.collection('PR').get('pr1'),id:'pr2',projectId:'q'},'pr2')
  const a=await f.protocol().claim(A2,{projectId:'p',workerType:'test',workspacePath:'/test'},'claim-a-0001')
  const b=await f.protocol().claim(B2,{projectId:'q',workerType:'test',workspacePath:'/test'},'claim-b-0001')
  assert.notEqual(a.session.id,b.session.id)
  await assert.rejects(f.protocol().read(A2,b.session.id),/session_forbidden/)
  for(const action of ['events','complete'])await assert.rejects(f.protocol().act(A2,b.session.id,action,{type:'progress',message:'No'},'cross-0001'),/session_forbidden/)
 }finally{f.close()}
})
test('queue number lookup update delete reorder and empty persisted queue regressions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'queue-store-regression-'))
 let source=readFileSync('lib/queue-store.ts','utf8')
 let code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'./queue-selection'","'./queue-selection.mjs'")
 for(const name of ['@feltdb/core','@feltdb/core/file-db'])code=code.replaceAll(`'${name}'`,JSON.stringify(import.meta.resolve(name)))
 writeFileSync(join(compiled,'queue-store.mjs'),code)
 process.env.DEV_QUEUE_LOCAL_AUTH='enabled';process.env.DEV_QUEUE_LOCAL_DATA_PATH=join(dir,'state')
 const store=await import(join(compiled,'queue-store.mjs'))
 try{
  await store.createProject({id:'regression',name:'Regression',goal:'Scope',repositoryPath:'/test',defaultBranch:'main'})
  assert.deepEqual(await store.listQueue('regression'),[])
  await assert.rejects(store.listQueue(''),/projectId_required/)
  await assert.rejects(store.listQueue('nonexistent'),/project_not_found/)
  const first=await store.createQueueItem({projectId:'regression',title:'One',objective:'First'}),second=await store.createQueueItem({projectId:'regression',title:'Two',objective:'Second'})
  assert.equal(first.id,1);assert.equal(second.id,2)
  await store.updateQueueItem('regression',2,{title:'Updated'})
  assert.equal((await store.listQueue('regression')).find(p=>p.id===2).title,'Updated')
  await store.reorderQueue('regression',2,'up')
  assert.deepEqual((await store.listQueue('regression')).map(p=>p.id),[2,1])
  const pr=(await store.listPRs('regression'))[0]
  assert.equal((await store.buildTaskPacket('regression',pr.id)).pr.title,'Updated')
  await store.deleteQueueItem('regression',2)
  assert.deepEqual((await store.listQueue('regression')).map(p=>p.id),[1])
  assert.equal(await store.updateQueueItem('regression',2,{title:'Missing'}),null)
  assert.equal(await store.deleteQueueItem('regression',2),false)
 }finally{await store.closeQueueStore();delete process.env.DEV_QUEUE_LOCAL_AUTH;delete process.env.DEV_QUEUE_LOCAL_DATA_PATH;rmSync(dir,{recursive:true,force:true})}
})
test('real operator answer and retry preserve durable decisions and old execution evidence',async()=>{
 const f=await fixture();try{
 const w=new TestWorker(f.protocol(),A);await w.claim();await w.send('events',{type:'started',message:'Started'});await w.send('question',{message:'Choose approach'})
 // Load local service against same actual durable SDK handle through a test-only module shim.
 const source=readFileSync('lib/local-actions.ts','utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("import { database } from './queue-store';",'const database = () => globalThis.__localTestDb;').replaceAll("'./auth-types'","'./auth-types.mjs'")
 writeFileSync(join(compiled,'local-answer.mjs'),code);globalThis.__localTestDb=f.db
 const actions=await import(join(compiled,'local-answer.mjs'))
 await actions.answerQuestion(w.id,'Use existing mechanism')
 assert.equal((await f.protocol().read(A,w.id)).status,'running')
 await w.send('result',{result:'PASS',tests:[]});const pending=await w.send('complete');assert.equal(pending.status,'completion_pending_acceptance')
 await w.send('fail',{message:'Actual failure'})
 await actions.retryTask('p',1)
 assert.equal((await f.db.collection('PR').get('pr1')).status,'queued')
 f.restart();globalThis.__localTestDb=f.db
 assert.equal((await f.db.collection('Decision').find({sessionId:w.id}))[0].answer,'Use existing mechanism')
 assert.equal((await f.protocol().read(A,w.id)).status,'failed')
 assert.ok((await f.db.collection('WorkerEvent').find({sessionId:w.id})).length>=5)
 }finally{delete globalThis.__localTestDb;f.close()}
})
test('heartbeat restart/ownership, stop fence and decision acknowledgement remain durable',async()=>{
 const f=await fixture();try{
 const w=new TestWorker(f.protocol(),A);await w.claim();await w.send('events',{type:'started',message:'Started'})
 await w.send('heartbeat',{},'heartbeat-unique-0001');const timestamp=(await f.protocol().read(A,w.id)).lastHeartbeatAt
 await assert.rejects(f.protocol().act(B,w.id,'heartbeat',{},'other-heartbeat-0001'),/session_forbidden/)
 f.restart();w.protocol=f.protocol();assert.equal((await w.protocol.read(A,w.id)).lastHeartbeatAt,timestamp)
 await w.send('heartbeat',{},'heartbeat-unique-0002')
 const decisionId='decision-test';await f.db.collection('Decision').insert({id:decisionId,sessionId:w.id,prId:'pr1',question:'Test',answer:'Answer',requiresHumanApproval:true,createdAt:new Date().toISOString()},decisionId)
 await w.send('decision-ack',{decisionId},'decision-ack-0001')
 assert.deepEqual((await w.protocol.read(A,w.id)).consumedDecisionIds,[decisionId])
 await w.send('stop',{},'stop-request-0001')
 await assert.rejects(w.send('events',{type:'progress',message:'After stop'}),/stop_requested_execution_fenced/)
 await assert.rejects(w.send('heartbeat'),/stop_requested_execution_fenced/)
 f.restart();w.protocol=f.protocol();assert.ok((await w.protocol.read(A,w.id)).stopRequestedAt)
 await w.send('stop-ack',{},'stop-ack-0001');assert.equal((await w.protocol.read(A,w.id)).status,'failed')
 await assert.rejects(w.send('heartbeat'),/session_terminal/)
 await assert.rejects(f.protocol().act(A,'nonexistent','heartbeat',{},'invalid-session-0001'),/session_not_found/)
 }finally{f.close()}
})
test('completed session refuses fresh heartbeat without reclaim',async()=>{
 const f=await fixture();try{
 const w=new TestWorker(f.protocol(),A);await w.claim()
 // Test-only accepted terminal fixture; production completion still cannot do this.
 await f.db.collection('WorkerSession').update(w.id,{status:'completed'})
 await assert.rejects(w.send('heartbeat',{},'terminal-heartbeat-0001'),/session_terminal/)
 assert.equal((await f.db.collection('WorkerSession').find()).length,1)
 }finally{f.close()}
})
