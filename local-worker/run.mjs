import {LocalWorker} from './local-worker.mjs'
const [projectId,workspace,resumeSession]=process.argv.slice(2)
if(!projectId||!workspace)throw new Error('Usage: npm run worker:local -- <projectId> <disposable-repository> [existing-session-id]')
const worker=new LocalWorker('http://127.0.0.1:3000',process.env.DEV_QUEUE_WORKER_TOKEN,workspace)
process.on('SIGINT',()=>worker.stopTask().then(()=>worker.close()).finally(()=>process.exit(0)))
process.on('SIGTERM',()=>worker.stopTask().then(()=>worker.close()).finally(()=>process.exit(0)))
let packet
if(resumeSession){packet=(await worker.reconnect(resumeSession)).taskPacket;console.log('Explicit reconnect; no new session claimed:',resumeSession)}
else{const claim=await worker.claim(projectId);packet=claim.taskPacket;console.log('Session:',claim.session.id)}
await worker.startTask(packet)
console.log('Worker outcome:',await worker.getStatus(),'. Human must run server acceptance gates; no automatic next task.')

await worker.close()
