import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {FileJsDb} from '@feltdb/core/file-db'
import {StateFirstDB} from '@feltdb/core/db'
const codeDir=mkdtempSync(join(tmpdir(),'acceptance-code-'))
for(const name of ['auth-types','acceptance/evaluator']){
 const source=readFileSync('lib/'+name+'.ts','utf8')
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll("'../auth-types'","'./auth-types.mjs'")
 writeFileSync(join(codeDir,name.split('/').at(-1)+'.mjs'),code)
}
const {evaluateAcceptance}=await import(join(codeDir,'evaluator.mjs'))
for(const pass of [true,false])test(`actual command gate ${pass?'PASS marks done':'FAIL fails'} with durable evidence`,async()=>{
 const root=mkdtempSync(join(tmpdir(),'acceptance-repo-')),runtime=new FileJsDb(join(root,'db')),db=new StateFirstDB(runtime)
 try{
 writeFileSync(join(root,'package.json'),JSON.stringify({name:'disposable',scripts:{test:`node -e "console.log('REAL GATE');process.exit(${pass?0:1})"`}}))
 const packet={project:{repositoryPath:root},pr:{acceptanceCriteria:['npm test']}}
 const session={id:'session',prId:'pr',projectId:'project',ownerId:'worker',status:'running',workspacePath:root,sequence:0,taskPacket:packet,resultEvidence:{result:'PASS'},completionRequestedAt:new Date().toISOString()}
 await db.collection('WorkerSession').insert(session,'session')
 await db.collection('PR').insert({id:'pr',projectId:'project',status:'running',workerSessionId:'session'},'pr')
 const result=await evaluateAcceptance(db,'session');assert.equal(result.result,pass?'PASS':'FAIL')
 assert.match(result.evidence[0].stdout,/REAL GATE/);assert.equal(result.evidence[0].exitCode,pass?0:1)
 assert.equal((await db.collection('PR').get('pr')).status,pass?'done':'failed')
 runtime.close();const reopen=new FileJsDb(join(root,'db')),restored=new StateFirstDB(reopen)
 assert.equal((await restored.collection('AcceptanceEvidence').find()).length,1);reopen.close()
 }finally{runtime.close();rmSync(root,{recursive:true,force:true})}
})
test('text PASS alone and empty criteria cannot complete',async()=>{
 const root=mkdtempSync(join(tmpdir(),'acceptance-empty-')),runtime=new FileJsDb(join(root,'db')),db=new StateFirstDB(runtime)
 try{await db.collection('WorkerSession').insert({id:'s',prId:'p',status:'running',workspacePath:root,sequence:0,taskPacket:{project:{repositoryPath:root},pr:{acceptanceCriteria:[]}},resultEvidence:{result:'PASS'},completionRequestedAt:'now'},'s');await db.collection('PR').insert({id:'p',workerSessionId:'s',status:'running'},'p');await assert.rejects(evaluateAcceptance(db,'s'),/acceptance_criteria_empty/);assert.equal((await db.collection('PR').get('p')).status,'running')}finally{runtime.close();rmSync(root,{recursive:true,force:true})}
})
test('unknown gates and unresolved questions cannot execute acceptance',async()=>{
 const root=mkdtempSync(join(tmpdir(),'acceptance-safety-')),runtime=new FileJsDb(join(root,'db')),db=new StateFirstDB(runtime)
 try{
 const session={id:'s',prId:'p',status:'running',workspacePath:root,sequence:0,taskPacket:{project:{repositoryPath:root},pr:{acceptanceCriteria:['echo bypass']}},resultEvidence:{result:'PASS'},completionRequestedAt:'now'}
 await db.collection('WorkerSession').insert(session,'s');await db.collection('PR').insert({id:'p',workerSessionId:'s',status:'running'},'p')
 await assert.rejects(evaluateAcceptance(db,'s'),/unsupported_acceptance_command/)
 await db.collection('WorkerSession').update('s',{currentQuestion:'unanswered'})
 await assert.rejects(evaluateAcceptance(db,'s'),/acceptance_not_eligible/)
 assert.deepEqual(await db.collection('AcceptanceEvidence').find(),[])
 }finally{runtime.close();rmSync(root,{recursive:true,force:true})}
})
test('concurrent acceptance is not admitted twice and changed session cannot become done',async()=>{
 const root=mkdtempSync(join(tmpdir(),'acceptance-fence-')),runtime=new FileJsDb(join(root,'db')),db=new StateFirstDB(runtime)
 try{
 writeFileSync(join(root,'package.json'),JSON.stringify({scripts:{test:'node -e "setTimeout(()=>console.log(\'gate\'),250)"'}}))
 await db.collection('WorkerSession').insert({id:'s',prId:'p',status:'running',workspacePath:root,sequence:0,taskPacket:{project:{repositoryPath:root},pr:{acceptanceCriteria:['npm test']}},resultEvidence:{result:'PASS'},completionRequestedAt:'now'},'s')
 await db.collection('PR').insert({id:'p',workerSessionId:'s',status:'running'},'p')
 const evaluation=evaluateAcceptance(db,'s');const checked=assert.rejects(evaluation)
 for(let i=0;i<100;i++){if((await db.collection('WorkerSession').get('s')).acceptanceRunId)break;await new Promise(r=>setTimeout(r,10))}
 await assert.rejects(evaluateAcceptance(db,'s'),/acceptance_already_admitted/)
 await db.collection('WorkerSession').update('s',{sequence:1,stopRequestedAt:new Date().toISOString()})
 await checked
 assert.equal((await db.collection('PR').get('p')).status,'running')
 assert.equal((await db.collection('AcceptanceEvidence').find()).length,1)
 }finally{runtime.close();rmSync(root,{recursive:true,force:true})}
})
test('acceptance admission remains fenced after durable reopen',async()=>{
 const root=mkdtempSync(join(tmpdir(),'acceptance-admitted-'));let runtime=new FileJsDb(join(root,'db')),db=new StateFirstDB(runtime)
 try{
 await db.collection('WorkerSession').insert({id:'s',prId:'p',status:'running',workspacePath:root,sequence:0,acceptanceRunId:'interrupted-run',taskPacket:{project:{repositoryPath:root},pr:{acceptanceCriteria:['npm test']}},resultEvidence:{result:'PASS'},completionRequestedAt:'now'},'s')
 await db.collection('PR').insert({id:'p',workerSessionId:'s',status:'running'},'p')
 runtime.close();runtime=new FileJsDb(join(root,'db'));db=new StateFirstDB(runtime)
 await assert.rejects(evaluateAcceptance(db,'s'),/acceptance_already_admitted_requires_attention/)
 assert.deepEqual(await db.collection('AcceptanceEvidence').find(),[])
 assert.equal((await db.collection('PR').get('p')).status,'running')
 }finally{runtime.close();rmSync(root,{recursive:true,force:true})}
})
