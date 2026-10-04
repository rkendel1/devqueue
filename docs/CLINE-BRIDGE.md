# Local VS Code worker bridge

Start with [Operating Dev Queue](OPERATING-DEV-QUEUE.md), [development](DEVELOPMENT.md).

DevQueueClient → CodingWorker → isolated ClineWorker. Queue selection remains in
Dev Queue; the bridge never chooses arbitrary PRs or approves acceptance.
Configure devQueue.endpoint to http://127.0.0.1:3000 and devQueue.projectId to the
explicit project ID. Configure Worker stores DEV_QUEUE_WORKER_TOKEN in VS Code
SecretStorage, never settings/URLs/workspace files/packets. Test Connection reads
identity/project/path without writing state or calling Cline. Local server grants
the single local worker execution over existing projects, not multi-user IAM.

Only one trusted local file workspace is allowed. Canonical path must equal project
repositoryPath. Remote, multi-root and mismatched workspaces are refused. A pending
claim persists its exact request key/body; a session binding prevents another claim
on restart. No automatic retry or automatic execution/resume is implemented.

## Current Cline blocker

Cline version tested: none. No installed extension/VSIX public execution/event API
was accessible. ClineWorker.connect refuses BEFORE claiming. No private calls,
UI scraping, keyboard automation or fabricated execution. Provide exact version,
VSIX/source, documented public task and event APIs for the next adapter PR.

Local operators can answer durable questions. Workers read their session's Decisions
through GET /api/worker-sessions/:id/decisions. Actual Cline answer delivery and
pause/resume are not implemented. Heartbeat endpoint exists but active bridge
heartbeat/outbox lifecycle remains unfinished. Completion requests remain pending
actual acceptance enforcement. No GPT, auto-merge or deployment automation.

Build/test from vscode-bridge: npm run typecheck, npm run build, npm test.
F5 launch configuration is included. Actual VS Code/Cline host dogfood is unverified.
