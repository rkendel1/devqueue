# Dev Queue — local-first

A single-user local queue for coding work. FeltDB owns durable work/session/evidence
state; Git owns code. No Vercel, managed FeltDB, production credentials or worker
IAM is required. Cline execution is still blocked pending a supported API audit.

## Startup

1. `npm install --package-lock=false` (Node 24; repository also declares pnpm).
2. Copy `.env.example` to `.env.local`. Set DEV_QUEUE_WORKER_TOKEN to a randomly
   generated local token of at least 32 characters, kept out of Git. Set
   DEV_QUEUE_LOCAL_DATA_PATH to a persistent path if changing the default.
3. `npm run dev -- --hostname 127.0.0.1` starts Next and the existing embedded local
   FeltDB runtime. A separate managed service is not needed.
4. Open http://127.0.0.1:3000. Create a project with the worker machine's absolute
   repositoryPath; select it; add/edit/reorder PRs. Specification and criteria are
   separate. Empty criteria remain empty.
5. `cd vscode-bridge && npm install && npm run build`; open the bridge folder in
   VS Code, F5 → Run Dev Queue Bridge. Open one trusted local repository in the host.
6. Configure devQueue.endpoint=http://127.0.0.1:3000 and actual devQueue.projectId.
   Configure Worker stores the dedicated token in SecretStorage. Test Connection
   checks identity/project/path without claiming. Start Next Task remains blocked
   before claim until Cline is audited. It does not fabricate execution.

Operator guide: [docs/OPERATING-DEV-QUEUE.md](docs/OPERATING-DEV-QUEUE.md).
Bridge: [docs/CLINE-BRIDGE.md](docs/CLINE-BRIDGE.md).
Development: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Local safety

Bind only loopback; no reverse proxy or network exposure. API rejects non-loopback
Host, cross-origin and cross-site requests. Human UI uses same-origin local access,
no operator token. Worker APIs require the dedicated local token; bearer credentials
cannot invoke human routes. This is a single local principal, not multi-user IAM.
A local malicious process is outside this boundary; do not treat Host checks as
network isolation. FeltDB uses a persistent file runtime with one writer process.
No alternate store or process-memory fallback exists.

Queue selection: persisted position, priority, deterministic ID. Dependencies must
be done. Sessions retain immutable server-generated packets and append-only evidence.
Operator answers are durable and resume waiting state; workers retrieve decisions
through their owned session. Retry is explicit for failed tasks and preserves the
old session/evidence. Results never imply acceptance. Completion remains
completion_pending_acceptance; automated gates and actual Cline execution are
unfinished, so the full automatic done → next loop is not yet demonstrated.

`npm test`, `npm run typecheck`, `npm run build`, `npm run test:worker-http`.
Extension: `npm run typecheck`, `npm run build`, `npm test` within vscode-bridge.

Durable recovery/outbox/stop reference: [docs/DURABLE-WORKER-LOOP.md](docs/DURABLE-WORKER-LOOP.md).
Extension dependencies must be installed before `npm run test:worker-http`; that
script builds the bridge and verifies its generic transport against real local Next.

## Deterministic local fixture worker and acceptance

LocalWorker is a real, restricted disposable calculator adapter—not Cline or a
mock queue. `npm run test:local-loop` runs actual Git/files/npm/protocol work.
`npm run worker:local -- <projectId> <fixture-repository> [existing-session]`
uses DEV_QUEUE_WORKER_TOKEN, explicit claim/reconnect, and fixture:add/subtract/multiply
specifications. General coding tasks remain unsupported by this adapter.

After worker PASS evidence and completion request, a human can explicitly authorize
**Run acceptance gates** in session inspection. Exact supported criteria are npm test,
npm run typecheck, npm run build. Real gate output persists and the server decides
done/failed. Empty/text-only gates do not pass. No manual mark-done button.
Only trusted repository scripts should be authorized. Interrupted gate admission
requires attention; there is no automatic gate/task retry.

[Local loop acceptance report](docs/LOCAL-LOOP-ACCEPTANCE.md) distinguishes passing
HTTP/repository tests from blocked browser/screenshot and unfinished adapter proofs.
