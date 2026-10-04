# Operating Dev Queue

Canonical operator entry point. See [development setup](DEVELOPMENT.md),
[bridge implementation reference](CLINE-BRIDGE.md) and [worker protocol](../WORKER_PROTOCOL.md).

## 1. What this system is

Dev Queue is the control plane for coding work. The queue decides what work is
authorized to run. A local VS Code worker is intended to claim that work, execute
it in the authorized repository and report durable evidence to the queue.

Vercel hosts the control plane, not the worker. VS Code hosts the local worker
bridge. Cline is the coding worker reached through a Cline-specific execution
adapter. Git remains the source of truth for code; Dev Queue remains the source
of truth for work state. The server owns claiming and completion eligibility.

**Current release is a foundation, not an operable hosted coding loop.** Production
APIs in this branch fail closed; local authenticated protocol tests work. Cline
execution through the bridge is blocked pending audit. Do not interpret a Ready
Vercel deployment as proof of working authentication, database or worker execution.

## 2. Architecture

```text
                    ┌───────────────────────┐
                    │     Dev Queue         │
                    │                       │
                    │ Projects              │
                    │ PR Queue              │
                    │ Worker Sessions       │
                    │ Events / Evidence     │
                    │ Decisions             │
                    └───────────┬───────────┘
                                │
                         HTTPS / worker auth
                                │
                                ▼
                    ┌───────────────────────┐
                    │ VS Code Worker Bridge │
                    │                       │
                    │ SecretStorage         │
                    │ Workspace validation  │
                    │ TaskPacket            │
                    │ Worker lifecycle      │
                    └───────────┬───────────┘
                                │
                         supported API only
                                │
                                ▼
                    ┌───────────────────────┐
                    │        Cline          │
                    │                       │
                    │ edit / command / test │
                    └───────────┬───────────┘
                                │
                                ▼
                         Git repository
```

The diagram is the intended boundary, **the Cline execution link is not implemented**.
Worker lifecycle observation/heartbeat in the bridge is not complete.

## 3. Hosted control plane

Open [Dev Queue](https://prism-nine-jade.vercel.app).
Vercel CLI inspection on 2026-10-04 resolved this alias to a Ready production
deployment created at 21:01:04 UTC. It does not identify this stacked documentation
branch as production. Browser/manual HTTP verification was unavailable in the
implementation sandbox; deployed UI behavior and runtime connectivity are unverified.

The following describes checked-in capabilities, not verified hosted support:

| Operator action | Current path and boundary |
| --- | --- |
| Create/select project | Local human-authenticated `POST /api/projects` / `GET /api/projects`; project selector UI is not implemented. |
| Associate repository | Set absolute `repositoryPath` and `defaultBranch` at project creation, or human `PATCH /api/projects/:id`. Use the worker machine's path, not Vercel's build path. |
| Create PR work | `POST /api/queue` accepts title/objective and optional dependency/branch; currently binds to `default-project`. |
| Specification / acceptance criteria | Queue creation copies objective into specification and creates empty acceptance criteria/constraints. Rich task editing is not exposed in the UI or queue PATCH route. Do not assume these gates have been defined. |
| Dependencies | Optional `dependency` at queue creation maps to one persisted dependency. Rich dependency editing is not exposed. |
| Reorder | Local human `PATCH /api/queue/:number` with action=reorder and direction=up/down. Priority persists. UI controls exist but browser human-credential entry is not implemented. |
| Inspect sessions | Owner-authenticated `GET /api/worker-sessions/:id`, or bridge Inspect Existing Session for its saved binding. No human session-list UI. |
| Inspect evidence | FeltDB Studio against a provisioned authority, or test inspection of WorkerEvent records. No general evidence-list HTTP endpoint/UI. |

Production requests from this branch return 503 until trusted caller authentication
is integrated. No production worker credential is provisioned by the repository.
Do not remove the guard or use a shared FeltDB token as a worker credential.

PR states: queued = pending work; running = session admitted, not proof of success;
waiting = unresolved question; failed = failed attempt, no automatic retry;
done = accepted completion (not reachable through the current completion endpoint).

## 4. Local VS Code worker setup

Requirements: VS Code compatible with the extension's `engines.vscode`, the bridge
source, a trusted single-root local workspace, matching repository and dedicated
worker credential. No marketplace extension or pre-created credential is supplied.

From a clean checkout, follow [Development](DEVELOPMENT.md) first. Then:

```sh
cd vscode-bridge
npm install
npm run build
npm run typecheck
npm test
```

Open `vscode-bridge` in VS Code. Use Run and Debug → **Run Dev Queue Bridge** (F5).
The included `.vscode/launch.json` launches an Extension Development Host and its
pre-launch task builds the extension. Open the disposable repository in that host
as a trusted, single-root local workspace. This VS Code host step has not been
executed in the sandbox.

Available commands: **Dev Queue: Configure Worker**, **Dev Queue: Start Next Task**,
and **Dev Queue: Inspect Existing Session**.

Run **Dev Queue: Configure Worker** and enter a dedicated worker token provisioned
for your local identity. VS Code SecretStorage stores it by endpoint origin. It
is never stored in settings, URLs, workspace files or TaskPackets. Never enter
the human token or FeltDB server token. The server determines identity and grants.

## 5. Connect the worker to the hosted queue

Configuration values (non-secret settings):

```json
{
  "devQueue.endpoint": "https://prism-nine-jade.vercel.app",
  "devQueue.projectId": "<actual-project-id>"
}
```

Project identity must be an actual server record ID, not a display name or PR
number. Repository identity is the project's absolute repositoryPath on the worker
machine; workspace identity is the open local folder's canonical path.

**Configuring this URL does not currently enable hosted claims.** Production
worker identity/authority integration is unprovisioned; this branch fails closed.
The adapter also refuses before claiming. Stop here for hosted execution until
those prerequisites are implemented; do not invent a credential.

For authenticated local protocol development use `http://127.0.0.1:3000` and the
local worker credentials configured in [Development](DEVELOPMENT.md). Remote
control planes require HTTPS. HTTP is permitted only for explicit loopback
localhost/127.0.0.1/[::1]. Redirects and URL credentials are refused; use the direct
endpoint, never append a token to a URL.

## 6. Workspace identity

```text
Dev Queue Project
        │ repositoryPath
        ▼
VS Code single-root workspace
        │
        ▼
Git repository
```

A worker must never execute a TaskPacket against another repository. Canonical
filesystem paths must match. The bridge refuses multi-root, remote, untrusted,
mismatched or ambiguous workspaces. It does not prove Git remote identity;
repository identity currently means canonical local directory identity.

Project `/repo/foo`, VS Code `/repo/bar`: **REFUSED — workspace mismatch**. Open
`/repo/foo` or correct the project through an authorized human operation before
admission. Never override the TaskPacket to make the mismatch disappear.

Multiple workspace roots: open the intended repository alone in a new window.
Do not guess which root the task meant. A pending claim for a different workspace
must be inspected/recovered manually, not replayed into another directory.

## 7. Claiming work

```text
queued
   │ claim-next
   ▼
running
   ├── question ──► waiting ──► future authorized decision/resume
   ├── failure ──► failed
   └── completion request
             ▼
       acceptance evaluation (not implemented)
             ▼
           done (future, only if gates pass)
```

The server chooses the deterministic next executable PR by persisted priority,
then PR number/identity tie-breakers, and dependencies requiring done. The worker's
configured project grants and ownership constrain access. A worker cannot pick an
arbitrary PR. Claims are fenced/atomic; concurrent claims cannot create duplicate
active executions. This version allows one active session per project.

PR status and session status differ: claim makes PR running and session claimed;
a worker started event makes the session running. No event implies tests passed.

## 8. TaskPacket

The immutable packet includes taskId/sessionId, complete Project and PR snapshots,
project goal, repositoryPath/defaultBranch, PR number/title/objective/specification,
acceptanceCriteria, constraints, dependencies, optional PR branch, previousDecisions
and workerContract (inspect first, run criteria, preserve unrelated changes, report
questions/results). An absent PR branch is not a license to invent authoritative
requirements. Empty criteria are not proof of acceptance.

Execute the packet provided; do not rewrite it from the UI. Changes to the PR after
admission do not silently change that session's snapshot. This preserves which
specification and evidence belonged to each execution attempt for auditability.

## 9. Start Task

Intended enabled workflow: Claim Next → validate workspace → inspect full packet
in JSON editor → explicit **Start Task** → worker execution. Workspace validation
occurs before the packet display in the checked-in extension.

**Actual current workflow stops before claim:** ClineWorker.connect refuses
because the supported interface is unverified. No session or execution is fabricated.

Restart never auto-resumes. Existing session bindings require **Dev Queue: Inspect
Existing Session**, not a silent second claim. Pending claim body/key is saved
before sending to preserve retry identity if the response is lost. Recovery is
manual; there is no automatic retry, no automatic next task and no safe Cline
reconnect implementation yet.

## 10. Cline integration — current blocker

The current environment did not contain an installed Cline extension or accessible
Cline VSIX, so the public Cline execution/event interface could not be audited.
Cline version tested: none. This does not prove Cline lacks an API.

Intentionally not done: no guessed Cline API, no private extension internals,
no UI scraping, no keyboard automation, no fake task execution, no fabricated
event stream, and no claim that Cline currently executes through the bridge.

Provide: (1) exact Cline version, (2) installed VSIX or accessible extension source,
(3) documented public execution interface, (4) documented public event interface.
The next adapter PR must use that actual supported contract, not internal commands
merely because they exist. See [technical audit reference](CLINE-BRIDGE.md).

## 11. Current operational limitations

| Capability | Status |
| --- | --- |
| Hosted Dev Queue | URL resolves to Ready deployment; browser/runtime behavior unverified |
| Durable queue | Available in authenticated local protocol tests; hosted authority unverified |
| Worker authentication | Available only in explicit local mode; production fail-closed |
| Worker claim | Available in local HTTP protocol; disabled bridge refuses before claim |
| Immutable TaskPacket | Available and tested locally |
| Workspace validation | Available in bridge foundation and filesystem tests |
| VS Code Bridge | Foundation available; extension host not tested here |
| Cline execution | Blocked pending audit |
| Active heartbeat | Server endpoint available; bridge lifecycle not complete |
| Durable evidence outbox | Not complete |
| Pause/resume | Not complete |
| GPT escalation | Not implemented |
| Automatic retry | Not implemented |
| Auto-merge | Not implemented |
| Auto-deploy | Not implemented as a Dev Queue feature |
| Acceptance enforcement | Not implemented; completion_pending_acceptance, never fake done |
| Hosted human/worker credential setup | Not provisioned; no working hosted walkthrough yet |
| Rich project/PR editor | Not complete; queue UI/API currently limited |

## 12. Troubleshooting

- **No worker credential:** run Configure Worker after obtaining an actual dedicated
  local worker credential. Client fails before network if SecretStorage has none.
  No production credential is supplied. Never substitute the human token.
- **Workspace mismatch:** compare canonical local directory with project.repositoryPath.
  Open the authorized repository; do not bypass validation.
- **Multiple workspace roots:** open a single local repository in a trusted window.
- **Worker cannot reach Dev Queue:** check direct URL, HTTPS (or local loopback),
  correct dedicated credential, network, and deployed server status. 401 means
  authentication failed; 403 means ownership/grants denied; 503 means unavailable
  authority/authentication or production guard. Redirects are deliberately refused.
- **Task already bound:** inspect existing session; restart protection prevents a
  second claim. Do not delete the binding to force another execution.
- **Cline cannot start:** current adapter has not passed the supported integration
  audit. There is no safe execution workaround. Provide the required audit inputs.
- **Waiting for decision:** question is durable; there is no production decision
  service or resume endpoint yet. Do not invent an answer or emit progress.
- **Completion pending:** a result, even PASS, is evidence only. Acceptance gates
  are not implemented, so done is correctly refused.

## 13. First successful operator walkthrough — readiness checklist

This is **not a completed hosted walkthrough**. Use a disposable non-critical repo.

1. Open hosted Dev Queue (URL established; UI/runtime manually verify locally).
2. Create a project (local human API exists; hosted auth/project UI pending).
3. Point it at the worker's absolute repository path (explicit human API field).
4. Add PR #1 (current queue API uses default-project).
5. Define objective/specification/criteria (rich editor/API work remains).
6. Open repo in trusted single-root local VS Code workspace.
7. Build/start extension in Development Host (instructions above; host unverified).
8. Configure actual dedicated local worker credential in SecretStorage.
9. Set endpoint/project ID (hosted authentication pending).
10. Run Start Next Task — **current verified stop: Cline audit refusal before claim**.
11. Inspect TaskPacket (future enabled adapter; local protocol smoke proves packet).
12. Explicitly Start Task (pending audited adapter).
13. Observe session (owner GET/Inspect Existing Session; no list UI).
14. Observe durable events (local tests/authority inspection; bridge outbox pending).
15. Execute supported Cline worker — **pending Cline audit and real fixture test**.
16. Submit observed result (server protocol exists; bridge event wiring pending).
17. Run acceptance (actual server acceptance enforcement pending).
18. Inspect final PR state; current completion must remain running/pending acceptance,
    not falsely done.

A clean checkout can run local protocol verification and build the extension; it
cannot yet demonstrate hosted Cline execution. Fix those blockers rather than
claiming the intended sequence is already supported.
