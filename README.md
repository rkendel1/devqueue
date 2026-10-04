# Dev Queue

## Dev Queue

Dev Queue is the control plane for durable coding work.

- [Operator guide](docs/OPERATING-DEV-QUEUE.md) — canonical entry point
- [Worker bridge](docs/CLINE-BRIDGE.md) — implementation and Cline audit blocker
- [Development](docs/DEVELOPMENT.md) — setup and verification
- [Worker protocol](WORKER_PROTOCOL.md) — endpoints and durable evidence
- [Deployed control plane](https://prism-nine-jade.vercel.app) — not the worker

**Hosted coding execution is not operational.** This branch's production APIs
fail closed pending trusted authentication; no production worker credentials are
provisioned. The Cline adapter is disabled pending an installed-version public API
audit. Local authenticated protocol tests prove durability, not real Cline execution.

## Contract and authority

`feltdb.flow` defines portable resources/capabilities, independent of UI framework
and worker bindings. `node scripts/contract.mjs` generates `feltdb.contract.json`
using FeltDB's converter. It is a candidate manifest, not an activated,
server-validated managed Contract Snapshot. Supported DSL does not automatically
enforce all application state/approval rules.

The server chooses work by persisted priority and done dependencies; no AI selects
work. Session admission and evidence use real FeltDB atomic fences and durable
receipts. TaskPackets remain immutable per session. Worker results do not imply
acceptance; completion returns completion_pending_acceptance, not done.

Remote authority credentials stay server-only. Explicit authenticated local file
storage is opt-in, single-process, and disabled in production. No authority or
customer credentials are provisioned by this source. Legacy filesystem data is
not automatically migrated. Do not remove fail-closed guards to enable a preview.

FeltDB documentation: https://github.com/rkendel1/feltdb
