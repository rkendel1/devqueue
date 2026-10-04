# Dev Queue

`feltdb.flow` is the portable collection and capability contract. It was adapted
from `npx --package @feltdb/core@0.11.9 create-feltdb dev-queue --server
--framework vanilla --no-webllm --no-install --no-start --yes`.
Framework and execution-provider bindings do not belong in the flow.

## Authority and setup

Run a durable FeltDB authority, not an in-memory runtime:

1. Install dependencies with the repository's pnpm version.
2. `npm run feltdb:validate` validates the supported FlowSpec grammar.
3. `node scripts/contract.mjs` regenerates `feltdb.contract.json` using FeltDB's
   `flowSpecToManifest`. This is a candidate manifest, **not a server-validated,
   activated managed Contract Snapshot**. Publish/validate it with your authority
   before using it in production.
4. Provision a managed FeltDB application (`npx feltdb init-managed`) or run
   `npx feltdb server --data /persistent/dev-queue --auth`. Set the server master
   key securely and create an appropriately scoped application API key.
5. Configure the server-only variables in `.env.example`; run `npm run dev`.
   For Vercel, configure the same variables in Project Settings → Environment
   Variables. The authority must be reachable remotely and use persistent storage.
6. Use `npx feltdb studio --connect <authority-url>` to inspect real records.

No authority was provisioned by this change. No credentials or customer records
are included. There is no local-filesystem or browser-state database fallback.
Existing legacy `.dev-queue/data` records are not automatically migrated.

## Implemented control-plane slice

- Project CRUD and persisted PR queue backed by the FeltDB collection API.
- Queue creation and reorder use atomic transactions; fenced reads reject
  concurrent changes instead of producing duplicate numbering or split order.
- Priority is the authoritative order, with PR number as deterministic tie-breaker.
- Selection skips non-queued PRs and requires all dependencies to be done.
- TaskPackets are server-generated from Project, PR and persisted Decisions.
- Admission fences project, queue, sessions and decisions; the session, PR
  assignment and admission evidence commit together, or not at all.
- An admitted session is idle/unassigned until an external provider connects.
  The UI does not claim coding execution, test success or human approval.
- Public queue edits cannot transition execution state. No automatic completion
  path exists, so acceptance checks cannot be bypassed through this API.

## Remaining execution protocol

The supplied specification is broader than FeltDB 0.11.9 FlowSpec's supported
DSL. Its enum, state-machine, escalation, authority and completion rules are
not automatically enforced by arbitrary capability statements. They require
application handlers and server authorization. Arrays are represented as JSON
fields in the supported grammar.

Worker authentication, worker-session CRUD, evidence ingestion, durable
question/decision approval, validated completion, retry policy, and worker
adapter delivery are **not implemented in this slice**. Do not expose these
APIs publicly without application authentication/authorization. The policies
in the candidate manifest require authenticated access, but a shared server key
is not a substitute for caller authorization in Next.js.

The queue never asks an AI to select work. AI decision providers must not own
queue order, human approval, or acceptance results.

FeltDB docs: https://github.com/rkendel1/feltdb

`proxy.ts` fails closed for production API requests until caller-level
identity and authorization are integrated. Local development works against
an authenticated authority. Do not remove this guard just to enable a preview.

## Worker protocol follow-up

See [WORKER_PROTOCOL.md](WORKER_PROTOCOL.md). Session ownership, authenticated
local claim-next, evidence/heartbeat/question/result/failure, idempotency and
immutable packets are now implemented. This supersedes the earlier list of
unimplemented worker endpoints. Production authentication remains unprovisioned
and fail-closed; completion remains pending actual acceptance enforcement.
Local file durability is now explicitly opt-in and never a production fallback.
