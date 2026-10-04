import {randomUUID} from 'node:crypto'
import {realpath,readFile,writeFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {join,relative,isAbsolute} from 'node:path'
// Deterministic disposable calculator worker, never marketed as general AI coding.
export class LocalWorker {
 constructor(endpoint,token,workspace){this.endpoint=endpoint;this.token=token;this.workspace=workspace;this.status='disconnected';this.stopped=false}
 async request(path,body,key=randomUUID()){
  const response=await fetch(new URL('/api/worker-sessions'+path,this.endpoint),{method:body===undefined?'GET':'POST',redirect:'error',headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json','idempotency-key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});const payload=await response.json();if(!response.ok)throw new Error(payload.error);return payload.data
 }
 async connect(){if(!this.token)throw new Error('token_required');const url=new URL(this.endpoint);if(url.username||url.password||url.search||url.hash||!['http:','https:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('local_only');this.status='idle'}
 async claim(projectId){await this.connect();const claimed=await this.request('/claim-next',{projectId,workerType:'deterministic-local-calculator',workspacePath:await realpath(this.workspace)});this.sessionId=claimed.session.id;this.packet=claimed.taskPacket;return claimed}
 async reconnect(sessionId){const session=await this.request('/'+encodeURIComponent(sessionId));if(await realpath(session.taskPacket.project.repositoryPath)!==await realpath(this.workspace))throw new Error('workspace_mismatch');this.sessionId=sessionId;this.packet=session.taskPacket;this.status=session.status==='claimed'?'idle':session.status;return session}
 async startTask(packet){
  if(packet.sessionId!==this.sessionId||await realpath(packet.project.repositoryPath)!==await realpath(this.workspace))throw new Error('workspace_mismatch')
  const operation=packet.pr.specification.trim()
  if(!['fixture:add','fixture:subtract','fixture:multiply'].includes(operation))throw new Error('LocalWorker accepts explicit disposable fixture operations only')
  const fixture=JSON.parse(await readFile(join(this.workspace,'package.json'),'utf8'))
  if(fixture.name!=='dev-queue-disposable-fixture')throw new Error('disposable_fixture_required')
  const current=await this.request('/'+this.sessionId)
  if(!['claimed','running','waiting'].includes(current.status))throw new Error('session_not_active')
  if(current.status==='claimed')await this.request(`/${this.sessionId}/events`,{type:'started',message:'LocalWorker started verified disposable fixture operation'})
  this.status='running'
  await this.request(`/${this.sessionId}/heartbeat`,{})
  if(operation==='fixture:add'){
   const prior=await this.request(`/${this.sessionId}/decisions`)
   if(!prior.length&&current.status!=='waiting')await this.request(`/${this.sessionId}/question`,{message:'Should the new function follow the existing direct-export pattern?'})
   this.status='waiting'
   while(!this.stopped){let decisions;try{decisions=await this.request(`/${this.sessionId}/decisions`)}catch{await new Promise(r=>setTimeout(r,500));continue}if(decisions.length){await this.request(`/${this.sessionId}/decision-ack`,{decisionId:decisions.at(-1).id});break}await new Promise(r=>setTimeout(r,250))}
   if(this.stopped)return
   this.status='running'
  }
  const name=operation.split(':')[1],symbol={add:'+',subtract:'-',multiply:'*'}[name]
  const root=await realpath(this.workspace),file=await realpath(join(root,'src/calculator.mjs')),tests=await realpath(join(root,'test'))
  for(const candidate of [file,tests]){const rel=relative(root,candidate);if(rel.startsWith('..')||isAbsolute(rel))throw new Error('fixture_path_escape')}
  const existing=await readFile(file,'utf8')
  if(!existing.includes(`function ${name}(`))await writeFile(file,existing+`\nexport function ${name}(a,b){return a${symbol}b}\n`)
  await writeFile(join(tests,`${name}.test.mjs`),`import test from 'node:test';import assert from 'node:assert/strict';import {${name}} from '../src/calculator.mjs';test('${name}',()=>assert.equal(${name}(2,3),${{add:5,subtract:-1,multiply:6}[name]}));\n`)
  await this.request(`/${this.sessionId}/events`,{type:'progress',message:`Wrote ${name} implementation to disposable repository`})
  const result=await new Promise(resolve=>{const child=spawn('npm',['test'],{cwd:this.workspace,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,HOME:process.env.HOME}});this.child=child;let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('close',exitCode=>resolve({exitCode,stdout,stderr}));child.on('error',e=>resolve({exitCode:null,stdout,stderr:e.message}))})
  await this.request(`/${this.sessionId}/events`,{type:'output',message:'Actual npm test output',metadata:result})
  await this.request(`/${this.sessionId}/result`,{result:result.exitCode===0?'PASS':'FAIL',summary:`Executed ${operation}`,tests:[{command:'npm test',...result}]})
  if(result.exitCode===0)await this.request(`/${this.sessionId}/complete`,{})
  else await this.request(`/${this.sessionId}/fail`,{message:'Actual fixture test command failed'})
  this.status=result.exitCode===0?'completed':'failed'
 }
 async getStatus(){return this.status}
 async sendDecision(decision){const persisted=await this.request(`/${this.sessionId}/decisions`);const found=persisted.find(d=>d.question===decision.question&&d.answer===decision.answer&&(!decision.id||d.id===decision.id));if(!found)throw new Error('decision_not_durable');await this.request(`/${this.sessionId}/decision-ack`,{decisionId:found.id})}
 async stopTask(){this.stopped=true;if(this.child)this.child.kill('SIGTERM')}
}
