# Local loop acceptance — partial product acceptance

Date: 2026-10-04. Baseline: `0b15d9197a218f978633034fce62f9ece4dfd64f`
(durable-worker-loop). Current main differs from that baseline; this change is
stacked, not a silent replacement of main. Source changes accompany this report.
Environment: Linux sandbox, Node 24.21.0, FeltDB 0.11.9 embedded local file runtime.
Adapter: deterministic LocalWorker, explicitly restricted to disposable calculator
fixtures. **Not Cline, not an AI coder, not a general-purpose task executor.**
Cline 4.1.22 remains disabled; [artifact audit](CLINE-VSIX-AUDIT.md) retained.

## Actual execution evidence

`npm run test:local-loop` starts real Next, creates a temporary real Git repository,
uses actual human/worker APIs, modifies real source/test files, executes actual npm
tests and runs independent server acceptance gates. It does not drive the browser.
Generated [HTTP/repository evidence](../artifacts/local-loop/evidence.json) contains
real session/event/gate records and actual git diff. Temporary absolute paths in
that evidence no longer exist after cleanup; they identify the run, not a live repo.
No tokens or credentials are recorded.

| Scenario | Evidence/status |
| --- | --- |
| Three project-scoped dependent tasks | Real HTTP create, no UI claim |
| Claim/immutable packet | Actual worker API; same snapshot after server restart |
| Real execution | LocalWorker writes calculator implementation/tests and executes npm test |
| Question/human answer | Actual durable question/Answer API/Decision read+ack; browser answer NOT exercised |
| Worker interruption | Worker stopped in waiting state; new instance explicitly reconnects; no extra claim |
| Server restart | Next terminated/restarted while question waiting; durable session/packet retained |
| Acceptance PASS/DONE | Human-authorized npm gate executes separately; captured exit 0/output; server commits done |
| Acceptance FAIL | Unit test executes actual exit-1 npm command; PR failed and evidence persisted |
| Explicit failure/retry | Test deliberately reports failure; new session on Retry API, old evidence retained; not fabricated Cline failure |
| Dependency progression | Normal claim returns #2 only after #1 done, #3 after #2 done |
| Failed retry passes | Real retry LocalWorker execution and independent npm gate |
| Duplicate/conflicting event delivery | Existing protocol/outbox regression tests, not every case in this fixture |
| Full VS Code-host restart | NOT RUN; no extension host |
| LocalWorker outgoing outbox | Integrated via generic FeltDB outbox; hardening verification below |
| Continuous fixture heartbeat | Recurring active-task transport heartbeat integrated; explicit shutdown verified below |
| Every UI control | NOT VERIFIED |
| Browser desktop/mobile | BLOCKED |
| Cline execution / GPT | NOT RUN / NOT IMPLEMENTED |

## Browser and screenshots

Playwright 1.63.0 and Chromium headless-shell build 1243 were downloaded. Browser
launch fails before opening a page: `libglib-2.0.so.0` missing (exit 127). Installing
Chromium system dependencies failed DNS resolution for Ubuntu package hosts in the
sandbox. The attempted browser suite `npm run test:ui` failed at launch.

A core browser scenario is checked in at tests/ui-local-loop.mjs; it uses actual
clicks/forms for project/task/attention/acceptance, with a real LocalWorker and no
mock pages. It is **untested**, and does not yet cover every requested action,
failure/retry screenshot, reorder/restart UI or all responsive surfaces.
No screenshots were produced. No PNGs were synthesized or substituted.

Expected artifacts after a successful browser run are artifacts/ui/*.png and
inventory.json. Requested 09-failed and 10-retry coverage remains to be added, not
represented as available. Full browser acceptance and the user-requested entire
Definition of Done **have not passed**.

## Acceptance mechanism and safety

Only explicit local human action runs gates; workers cannot call that endpoint.
Supported exact gates: npm test, npm run typecheck, npm run build. The immutable
session's criteria govern verification, not later edits. Empty or unsupported
criteria, unresolved question, stop request, missing worker PASS/result/completion
request refuse evaluation. Text PASS alone remains insufficient.

Commands execute trusted repository npm scripts, no interpolated shell command.
The UI prompts before authorizing repository code execution. Child environment is
minimal and excludes worker/FeltDB secrets. Output is capped at 1 MiB per stream;
timeout is 60 seconds, process group is terminated on Linux. This is not a sandbox
for malicious repositories; local operator must trust the repository scripts.

An acceptance run is admitted durably once. Concurrent/duplicate/crash attempts
cannot silently rerun gates: acceptanceRunId requires human attention if interrupted.
Each gate's evidence persists even if final fencing fails. Final PR/session/event
transition is atomic and fenced; concurrent changes cannot be overwritten to done.
There is no automatic resume of interrupted acceptance or automatic next task.

## Reproduction

Install root/extension dependencies, then:

```sh
npm test
npm run typecheck
npm run build
npm run test:local-loop
npm run test:worker-http
npm --prefix vscode-bridge run typecheck
npm --prefix vscode-bridge test
```

On a host supporting Chromium system libraries:

```sh
npx playwright install --with-deps chromium
npm run test:ui
```

LocalWorker CLI (disposable marker package required):
`npm run worker:local -- <projectId> <repository> [existing-sessionId]`.
DEV_QUEUE_WORKER_TOKEN remains server-side process environment/SecretStorage;
never put it in CLI arguments or URLs. Fixture specifications are fixture:add,
fixture:subtract, fixture:multiply. The adapter preserves the complete packet,
but only implements these explicit test operations. No vague task is passed to AI.

## Honest acceptance statement

Verified HTTP/repository slice: Dev Queue can give dependent fixture tasks to a real
deterministic local worker, retain human answers and interruption state, execute
independent repository acceptance commands, mark passing work done and permit the
next normal claim. UI/browser every-action proof and full browser and VS Code-host
acceptance remain unfinished. **The full requested product acceptance is not complete.**

## Durable adapter hardening follow-up

Baseline: 114d35ed727ffa520a790d5e4e7ab75cf54f227b (landed durable-worker-loop).
LocalWorker now sends session mutations via the generic DurableWorkerLoop/FeltDB
BridgeOutbox. Claim remains a server protocol operation, not queue logic in worker.
Each outgoing event/result/question/decision acknowledgement persists before send;
failed delivery stays pending. Explicit reconnect drains the same identities. Outbox
records live by default beside the disposable workspace in .dev-queue-worker, not
in Git workspace files; tests supply an explicit temp outbox path. Credentials
are never written there. Only one local writer may open that path at a time.

Active-task transport heartbeats recur (default 15s). They disconnect in finally,
on explicit interruption or transport failure. Completion-pending-acceptance stops
worker heartbeats because local execution ended, even though server still awaits
human gates. No task retry/reclaim is triggered. Exceptions report disconnected,
leaving durable session/outbox for attention; pending evidence is not discarded.

Generic outbox admission is serialized and flush callers share/await the drain,
which drains newly admitted items too. This fixes returning before caller evidence
has been acknowledged during a concurrent heartbeat drain. Receipt identity/body
and monotonic event sequence remain unchanged. Test-only 100ms heartbeats verify
multiple active heartbeats, cessation and all acknowledged evidence. Unit tests
cover concurrent evidence admission/order and duplicate flush without duplicates.

The updated HTTP/Git scenario explicitly closes the worker FeltDB, restarts server,
opens a new LocalWorker, reconnects and retains prior evidence/session. New checks
verify strict contiguous event sequences per session and heartbeat cessation.
Acceptance admission remains fenced and is never silently replayed; interrupted
runs continue to require attention. No change to ClineWorker or VSIX audit.

Browser/core UI suite was attempted and failed before launch. Every-control coverage
and screenshots remain incomplete; see UI-ACTION-INVENTORY.md. Real VS Code-host
checks remain unavailable. These gaps prevent claiming full Definition of Done.

Hardening verification summary (this PR): 21 root tests passed; seven bridge tests
passed; root and extension typecheck passed; Next production build passed. Real
HTTP/Git LocalWorker restart/answer/acceptance/retry loop passed with the shared
outbox/continuous-heartbeat assertions. Browser suite failed before page launch;
zero screenshots; real VS Code-host NOT RUN. Full every-action browser suite remains
unfinished, not merely a missing screenshot file. Definition of Done: **NOT COMPLETE**.
