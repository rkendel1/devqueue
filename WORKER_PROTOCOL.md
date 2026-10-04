# Local worker protocol

Single local worker identity authenticated by DEV_QUEUE_WORKER_TOKEN, no IAM.
Human APIs require same-origin loopback access and refuse bearer worker credentials.
Run only on loopback, no proxy/network exposure. Worker credentials stay SecretStorage.

POST /api/worker-sessions/claim-next selects the deterministic next task for projectId.
POST /api/worker-sessions additionally validates the requested prId equals next.
GET /:id inspects owned session; GET /:id/decisions reads durable local answers.
POST /:id/heartbeat, events, question, result, complete and fail preserve existing
atomic fences, immutable packets, event sequence and durable request receipts.
POST requires Idempotency-Key; retries must preserve body/key. No auto retry.

Session claimed -> running on started event; question -> waiting; local human
POST /api/local-actions action=answer -> durable Decision and running session/PR.
No answer is invented. Result persists evidence. Complete returns
completion_pending_acceptance; no PASS-only done transition. Fail is durable.
Local retry is explicit for failed PR, detaches old session assignment but preserves
its history. No arbitrary start/status/mark-done endpoint bypasses those invariants.

Queue order is position then priority then deterministic ID. Worker cannot reorder
or modify projects/tasks. A session retains its server-generated task snapshot
through PR editing and server restart. One active execution per project.
Heartbeat activity is not a lease; no stale automatic failure or reclaim.

No Cline execution/answer delivery, GPT, acceptance automation, pause/resume adapter,
active bridge heartbeat or outbox is completed. Tests prove protocol, not coding.
