import {spawn,execFileSync} from 'node:child_process'
import {once} from 'node:events'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {LocalWorker} from '../local-worker/local-worker.mjs'
const dir=mkdtempSync(join(tmpdir(),'dev-queue-real-loop-')),repo=join(dir,'repo'),token=randomBytes(32).toString('hex'),base='http://127.0.0.1:3191'
mkdirSync(join(repo,'src'),{recursive:true});mkdirSync(join(repo,'test'))
writeFileSync(join(repo,'package.json'),JSON.stringify({name:'dev-queue-disposable-fixture',type:'module',scripts:{test:'node --test test/*.test.mjs'}}))
writeFileSync(join(repo,'src/calculator.mjs'),'// Disposable fixture\n')
writeFileSync(join(repo,'test/calculator.test.mjs'),"import test from 'node:test';import assert from 'node:assert/strict';import * as c from '../src/calculator.mjs';test('calculator',()=>{assert.equal(c.add(2,3),5);if(c.subtract)assert.equal(c.subtract(5,2),3);if(c.multiply)assert.equal(c.multiply(2,3),6)})")
execFileSync('git',['init',repo]);execFileSync('git',['-C',repo,'add','.']);execFileSync('git',['-C',repo,'-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','Initial fixture'])
let server
async function start(){server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3191'],{env:{...process.env,DEV_QUEUE_LOCAL_DATA_PATH:join(dir,'db'),DEV_QUEUE_WORKER_TOKEN:token},stdio:['ignore','pipe','pipe']});server.stdout.on('data',()=>{});server.stderr.on('data',()=>{});for(let i=0;i<120;i++){if(server.exitCode!==null)throw new Error('Server exited');try{if((await fetch(base)).ok)return}catch{}await new Promise(r=>setTimeout(r,500))}throw new Error('Startup timeout')}
async function stop(){if(server&&server.exitCode===null){server.kill('SIGTERM');await once(server,'exit')}}
async function human(path,body){const response=await fetch(base+path,{method:body?'POST':'GET',headers:{'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const payload=await response.json();assert.ok(response.ok,JSON.stringify(payload));return payload.data}
try{
 await start()
 const project=await human('/api/projects',{name:'Disposable calculator',goal:'Real commands, no AI',repositoryPath:repo,defaultBranch:'master'})
 for(const [index,operation]of ['add','subtract','multiply'].entries())await human('/api/queue',{projectId:project.id,number:index+1,title:operation,objective:`Implement ${operation}`,specification:`fixture:${operation}`,acceptanceCriteria:['npm test'],dependencies:index?[String(index)]:[]})
 const first=new LocalWorker(base,token,repo);const claim=await first.claim(project.id);assert.equal(claim.taskPacket.pr.number,1)
 let execution=first.startTask(claim.taskPacket)
 for(let i=0;i<100;i++){if((await first.request('/'+first.sessionId)).status==='waiting')break;await new Promise(r=>setTimeout(r,100))}
 assert.equal((await first.request('/'+first.sessionId)).status,'waiting')
 await first.stopTask();await execution
 await stop();await start()
 const resumed=new LocalWorker(base,token,repo)
 const restored=await resumed.reconnect(first.sessionId);assert.deepEqual(restored.taskPacket,claim.taskPacket)
 execution=resumed.startTask(restored.taskPacket)
 await human('/api/local-actions',{action:'answer',sessionId:first.sessionId,answer:'Use direct exports'})
 await execution
 const accepted=await human('/api/local-actions',{action:'acceptance',sessionId:first.sessionId});assert.equal(accepted.result,'PASS')
 assert.equal((await human('/api/queue?projectId='+project.id))[0].status,'done')
 const second=new LocalWorker(base,token,repo);const secondClaim=await second.claim(project.id);assert.equal(secondClaim.taskPacket.pr.number,2)
 await second.request(`/${second.sessionId}/events`,{type:'started',message:'Verified deterministic failure fixture starting'})
 await second.request(`/${second.sessionId}/fail`,{message:'Explicit deterministic failure scenario; no test PASS claimed'})
 await human('/api/local-actions',{action:'retry',projectId:project.id,number:2})
 const retry=new LocalWorker(base,token,repo);const retryClaim=await retry.claim(project.id);assert.notEqual(retryClaim.session.id,second.sessionId)
 await retry.startTask(retryClaim.taskPacket);assert.equal((await human('/api/local-actions',{action:'acceptance',sessionId:retry.sessionId})).result,'PASS')
 const third=new LocalWorker(base,token,repo);const thirdClaim=await third.claim(project.id);assert.equal(thirdClaim.taskPacket.pr.number,3)
 await third.startTask(thirdClaim.taskPacket);assert.equal((await human('/api/local-actions',{action:'acceptance',sessionId:third.sessionId})).result,'PASS')
 const inspection=await human('/api/inspection?projectId='+project.id);assert.equal(inspection.acceptance.length,3);assert.equal(inspection.sessions.length,4)
 assert.ok(inspection.sessions.some(s=>s.id===second.sessionId&&s.status==='failed'))
 const diff=execFileSync('git',['-C',repo,'diff'],{encoding:'utf8'});assert.match(diff,/function add/);assert.match(diff,/function subtract/);assert.match(diff,/function multiply/)
 mkdirSync('artifacts/local-loop',{recursive:true});writeFileSync('artifacts/local-loop/evidence.json',JSON.stringify({date:new Date().toISOString(),adapter:'deterministic LocalWorker',inspection,diff,node:process.version},null,2))
 console.log('PASS: real HTTP LocalWorker, Git file changes/npm tests, restart/question/answer, durable acceptance DONE, explicit retry history, next eligible claims. UI/browser not exercised.')
}finally{await stop();rmSync(dir,{recursive:true,force:true})}
