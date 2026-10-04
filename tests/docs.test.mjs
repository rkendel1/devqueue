import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
test('local product has no active hosted IAM or project fallback',()=>{const store=readFileSync('lib/queue-store.ts','utf8');assert.doesNotMatch(store,/default-project/);const flow=readFileSync('feltdb.flow','utf8');assert.doesNotMatch(flow,/collection WorkerCredential|collection WorkerProjectGrant/);const readme=readFileSync('README.md','utf8');assert.match(readme,/npm run dev -- --hostname 127.0.0.1/);assert.match(readme,/completion_pending_acceptance/);assert.match(readme,/Cline execution is still blocked/)})
