import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
const files=['README.md','docs/OPERATING-DEV-QUEUE.md','docs/DEVELOPMENT.md','docs/CLINE-BRIDGE.md']
const docs=Object.fromEntries(files.map(file=>[file,readFileSync(file,'utf8')]))
const root=JSON.parse(readFileSync('package.json','utf8'))
const extension=JSON.parse(readFileSync('vscode-bridge/package.json','utf8'))
test('canonical operator entry and deployed URL exist',()=>{
 assert.ok(docs['README.md'].includes('docs/OPERATING-DEV-QUEUE.md'))
 assert.ok(docs['README.md'].includes('https://prism-nine-jade.vercel.app'))
 assert.ok(docs['docs/OPERATING-DEV-QUEUE.md'].includes('https://prism-nine-jade.vercel.app'))
 for(const file of files)assert.ok(existsSync(file))
})
test('relative documentation links resolve',()=>{
 for(const [file,content]of Object.entries(docs))for(const match of content.matchAll(/\]\(([^)]+)\)/g)){
 const link=match[1];if(/^[a-z]+:|^#/.test(link))continue
 assert.ok(existsSync(resolve(dirname(file),link.split('#')[0])),`${file}: broken ${link}`)
 }
})
test('documented npm scripts are real in root or extension',()=>{
 for(const [file,content]of Object.entries(docs))for(const match of content.matchAll(/npm run ([\w:-]+)/g))assert.ok(root.scripts[match[1]]||extension.scripts[match[1]],`${file}: unknown script ${match[1]}`)
 for(const name of ['test','typecheck','build','test:worker-http'])assert.ok(root.scripts[name])
 for(const name of ['test','typecheck','build'])assert.ok(extension.scripts[name])
 assert.match(docs['docs/DEVELOPMENT.md'],/cd vscode-bridge[\s\S]*npm run typecheck[\s\S]*npm run build[\s\S]*npm test/)
})
test('extension command titles and settings agree with manifest',()=>{
 const guide=docs['docs/OPERATING-DEV-QUEUE.md']
 for(const command of extension.contributes.commands)assert.ok(guide.includes(command.title),`missing command ${command.title}`)
 for(const property of Object.keys(extension.contributes.configuration.properties))assert.ok(guide.includes(property))
 assert.ok(existsSync('vscode-bridge/.vscode/launch.json'))
 assert.equal(JSON.parse(readFileSync('vscode-bridge/.vscode/launch.json','utf8')).configurations[0].preLaunchTask,'npm: build')
})
test('docs retain explicit blockers and never assert implemented Cline/GPT/retry',()=>{
 const all=Object.values(docs).join('\n')
 for(const positive of [/Cline execution (?:is implemented|is available|is wired|is supported|works through)/i,/GPT escalation (?:is implemented|is available|is supported)/i,/automatic retry (?:is implemented|is available|is supported|is enabled)/i])assert.doesNotMatch(all,positive)
 assert.match(docs['docs/OPERATING-DEV-QUEUE.md'],/Cline integration — current blocker/)
 assert.match(docs['docs/OPERATING-DEV-QUEUE.md'],/production fail-closed/)
 assert.match(docs['docs/OPERATING-DEV-QUEUE.md'],/SecretStorage/)
 assert.match(docs['docs/OPERATING-DEV-QUEUE.md'],/Not implemented; completion_pending_acceptance/)
 assert.match(docs['docs/CLINE-BRIDGE.md'],/Cline version tested: none/)
})

test('documented environment names and referenced implementation files exist',()=>{
 const content=docs['docs/DEVELOPMENT.md']
 const example=readFileSync('.env.example','utf8')
 for(const name of new Set(content.match(/\b(?:DEV_QUEUE_[A-Z_]+|FELTDB_[A-Z_]+)\b/g)))assert.ok(example.includes(name+'='),`unknown environment ${name}`)
 for(const file of ['lib/worker-auth.ts','lib/worker-protocol.ts','vscode-bridge/src/extension.ts','vscode-bridge/src/dev-queue-client/client.ts','vscode-bridge/src/cline/cline-worker.ts','vscode-bridge/.vscode/tasks.json','tests/next-worker-smoke.mjs'])assert.ok(existsSync(file))
})
test('runtime contract documents durable worker credentials and no hidden project binding',()=>{
 const store=readFileSync('lib/queue-store.ts','utf8')
 assert.doesNotMatch(store,/['"]default-project['"]/)
 const flow=readFileSync('feltdb.flow','utf8')
 for(const name of ['Worker','WorkerProjectGrant','WorkerCredential'])assert.ok(flow.includes(`collection ${name} {`))
 const manifest=JSON.parse(readFileSync('feltdb.contract.json','utf8'))
 for(const name of ['Worker','WorkerProjectGrant','WorkerCredential'])assert.ok(manifest.collections.some(c=>c.name===name))
 assert.ok(docs['docs/OPERATING-DEV-QUEUE.md'].includes('Dev Queue: Test Connection'))
})
