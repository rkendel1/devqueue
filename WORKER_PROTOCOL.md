# Worker session protocol

This protocol is worker-agnostic. There is no production fake worker, Cline
integration, UI automation, GPT escalation, automatic approval or acceptance.

## Authentication boundary

`WorkerAuthenticator` maps trusted identity to a principal and project grants.
No production identity provider is provisioned: **all production APIs remain
503 fail-closed**. Local mode explicitly requires `DEV_QUEUE_LOCAL_AUTH=enabled`
and `DEV_QUEUE_LOCAL_WORKERS` (server-only JSON identities containing distinct
random bearer tokens of at least 32 characters). Identity and project grants
come from configuration, never `workerType`. Keep tokens in protected environment
inputs, never in URLs or source control. Local human APIs require a separate
`DEV_QUEUE_LOCAL_HUMAN_TOKEN`. Worker credentials cannot use human APIs, even if
they omit Authorization. Do not bind authenticated local development to public
network interfaces. Browser human credential UX is not implemented.

For durable local authority, configure `DEV_QUEUE_LOCAL_DATA_PATH` to an absolute
file path on persistent disk and use one Node process. This opt-in mode uses the
actual FeltDB FileJsDb + StateFirstDB transaction implementation. It is disabled
in production. Otherwise configure the existing remote FeltDB URL/token.

## Endpoints

All routes authenticate before authority access. GET requires session ownership
and a project grant. POST additionally requires `Idempotency-Key` matching
`[A-Za-z0-9_-]{8,128}`. Retry conflicts with the **same key and body**.

- `POST /api/worker-sessions/claim-next`: projectId, workerType, workspacePath.
- `POST /api/worker-sessions`: same fields plus prId, which must equal the
  deterministic next executable PR. This does not permit arbitrary selection.
- `GET /api/worker-sessions/:id`: session, immutable TaskPacket and derived activity.
- `POST /:id/heartbeat`: {}. Updates persisted lastHeartbeatAt.
- `POST /:id/events`: type (started/output/progress/error), message, optional metadata.
- `POST /:id/question`: message, optional metadata. Running → waiting for both PR
  and session, atomic with question evidence. No decision endpoint is implemented.
- `POST /:id/result`: result string, optional summary/tests/git. Persists structured
  evidence; it does not approve acceptance. Input is JSON, maximum 64 KiB.
- `POST /:id/complete`: {}. Requires running session, result evidence and no question.
  Returns `completion_pending_acceptance`. A completed-type event records only the worker request, with acceptance=pending. Neither session nor PR becomes completed/done.
- `POST /:id/fail`: message, optional metadata. Running/waiting → failed with evidence;
  PR fails in the same commit. No retry is automatically started.

Session lifecycle: admission creates **claimed**, started event transitions to
**running**, question transitions to **waiting**. Waiting forbids output/progress
and result/completion. A future authorized decision service will resume sessions.
Terminal failures refuse new evidence. Completed is reserved for future acceptance
approval. PR becomes running at admission; this is not worker success.

## Atomicity, ordering and retries

Claims fence project + project PRs + project sessions, and separately the chosen
PR's decisions; the packet, session, PR assignment and idempotency receipt commit
atomically. A project may have only one active claimed/running/waiting session.
This stronger limit prevents two concurrent workers from claiming the same task.
Legacy idle sessions also block admission.

Session mutations fence the session and assigned PR. Every evidence append
increments an explicit persisted session sequence. Event keys are unique and
requireAbsent. Workers have no edit/delete evidence API. Receipt IDs are hashes
of principal, operation/session and client request ID; the receipt and state
changes share one atomic transaction. Committed duplicates return the original
response, including after failure/restart. Reuse with different input is rejected.
JSON property order forms part of the request fingerprint; retries should send the
identical body. Concurrent mutations conflict rather than overwrite evidence.
No assumption about tx.set assigning __version is used.

GET activity is derived from persisted lastHeartbeatAt: more than 60 seconds old
is stale; terminal states report completed/failed. This is **not a lease** and
does not authorize reassignment or cause automatic failure. No in-memory timer
owns execution state.

## Verification

- `npm test`: real FeltDB file-backed lifecycle, reopen/recovery, question,
  immutable packet, result/completion refusal, idempotency, concurrent claim,
  event sequencing, failure, arbitrary claim and cross-owner access tests.
- `npm run typecheck`
- `npm run build`
- `node tests/next-worker-smoke.mjs`: real Next dev process, authenticated claim,
  heartbeat/events/question, termination/restart, durable record inspection,
  and production Next start fail-closed test. Tokens are generated in-process.

The tests use real SDK transactions/persistence, not an in-memory mocked store.
Managed remote-authority behavior is not verified without a provisioned endpoint.
The test-only simulated decision writes durable state directly; it is deliberately
not exposed in production. Acceptance is deliberately refused, not fabricated.
