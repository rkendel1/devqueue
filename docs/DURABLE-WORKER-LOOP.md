# Durable local worker loop

Local startup and token setup remain in [README](../README.md). FeltDB is the only
durable database, both for server state and the bridge's outgoing journal. No IAM,
managed service, GPT, reclaim, automatic next task, merge or deployment automation.

## Protocol

Claim atomically creates a claimed session and running PR with immutable packet.
Started -> running; question -> waiting; human Answer -> Decision + running state.
Worker reads owned Decisions and POST decision-ack with decisionId plus stable
Idempotency-Key. consumedDecisionIds is durable. Decision acknowledgement means
consumer acknowledgement, not proof Cline received it. Cline delivery remains blocked.

Heartbeat persists lastHeartbeatAt and an append-only heartbeat event/sequence.
It reports bridge transport connectivity, NOT coding progress or a lease. More than
60 seconds old is stale inspection only. Stale never permits a second claim.
Ownership and assignment are checked; terminal sessions reject fresh heartbeats.
A committed request replay still returns its original receipt after terminal state.

POST stop (or local UI Request Stop) persists stopRequestedAt and fences all new
execution writes including heartbeats/results/completion. Session stays active,
blocking another claim. This does not kill a process or authorize retry. Only worker
stop-ack after verified safe termination sets failed/stopAcknowledgedAt. Cline stop
is unavailable, so the extension sends no fake termination acknowledgement and
shows manual attention. Explicit retry requires failed and preserves old evidence.

Failure appends failed evidence. completed evidence remains a completion request,
never accepted success. No mark-done shortcut: completion_pending_acceptance remains.

## Outbox and reconnect

The bridge opens local FeltDB at globalStorageUri/feltdb-worker. BridgeBinding and
BridgeOutbox store session/endpoint, ordered evidence/body and stable request IDs,
never credentials. pending -> acknowledged only after a successful server response.
Lost response leaves pending; retransmit exactly the same request/body. A server
receipt deduplicates; conflicting identity/content is rejected. Acknowledged entries
remain auditable. No automatic task retry; explicit Reconnect drains pending evidence.
A transient failure stops that flush; evidence stays durable for the next reconnect.

VS Code: Attach Existing Session can bind a known owned session from an independent
protocol worker, verifying workspace without claiming or starting Cline. It will not
replace an existing binding. Reconnect Existing Task verifies current ownership/server state and canonical
workspace, drains pending evidence and starts transport heartbeats every 15 seconds.
It never claims a new session or starts/resumes coding. A network heartbeat failure
stops the loop and needs explicit reconnect. Dispose stops timers. Request Stop sends
fenced protocol stop, then calls the adapter; unavailable adapter shows manual attention.

Startup inspects persisted bindings and server status, with warning for unreachable
server. It never auto-reconnects, resumes, or claims. Multiple bindings cannot be
silently chosen; existing global pointer is a convenience, FeltDB retains bindings.
Current Cline start refuses before admission. Generic DurableWorkerLoop is usable by
future audited adapters, but observed Cline event wiring is not implemented.

## Verified and unverified

Unit tests use real FeltDB files/reopen, server protocol heartbeats/ownership/stop,
decisions/retry and outbox replay. HTTP smoke uses real Next, lost acknowledgement
after commit, outbox reopen, server restart, explicit reconnect, decision retrieval/
ack and stop fence. It uses no fake coding outcome. VS Code extension-host restart
and real Cline execution are not available in this environment and remain unverified.
No installed Cline version/VSIX exists here; ClineWorker was not changed. Public
execution/events/cancellation must be audited before adapter control is enabled.

Acceptance automation and the full coding loop remain pending; the generic transport
loop does not by itself prove an external coding worker executed or finished a task.
