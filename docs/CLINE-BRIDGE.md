# VS Code bridge — integration disabled pending installed Cline audit

## Audit evidence and limits

The implementation environment contains neither a `code` executable nor an
installed Cline extension directory. No installed Cline version could be inspected.
**Cline version tested: none. Actual Cline task invocation mechanism: unverified.**
This is not a finding that Cline has no public API. It means that no supported API
for the user's installed version has been established here.

Before enabling the adapter, obtain the exact installed extension version/VSIX
and its matching public API documentation/source. Verify activation exports,
public extension-to-extension contracts, task startup, event/question/result
transport, pause/stop/resume and restart identity. Internal commands or webview
state are not sufficient evidence of a supported contract.

`ClineWorker.connect()` deliberately refuses. The Start Next Task command checks
this before claiming, so installing this bridge will not create blocked work.
No HTTP server, Cline command, UI scraping or private API is invented. Real Cline
execution, fixture editing/tests, event observation and dogfood are **not tested**.

## Architecture

Independent `vscode-bridge` extension → DevQueueClient (authenticated HTTP) →
CodingWorker interface → isolated ClineWorker. No queue selection logic lives in
the extension. Decisions have an interface only; no GPT or decision endpoint.

The HTTP client implements claim-next, session inspection, heartbeat, events,
question, result, completion and failure. It sends no fabricated evidence and
never marks a PR done. Transport rejects credential-bearing URLs, insecure remote
HTTP and redirects. Dedicated credentials are stored in VS Code SecretStorage,
scoped to endpoint origin, not settings or TaskPackets. Server ownership/grants
remain authoritative; the bridge cannot validate token role without the server.

## Install and setup

`cd vscode-bridge && npm install && npm run build && npm test`.
Open this folder in VS Code and launch an Extension Development Host using a
standard extension launch configuration. Packaging/marketplace publication is
not performed. Configure `devQueue.endpoint` and `devQueue.projectId` in settings.
Run **Dev Queue: Configure Worker** and supply a dedicated worker token provisioned
through the server's authenticated local-worker configuration. Never use the human
token. Production server endpoints currently fail closed.

Commands: Configure Worker, Start Next Task, Inspect Existing Session.
Exactly one trusted, local file workspace is required. Canonical filesystem paths
must equal TaskPacket.project.repositoryPath. Multi-root/remote workspaces are
refused. The immutable full packet opens in a JSON editor before a modal Start Task
action; it is never reconstructed from browser UI.

Claims persist their endpoint/body/idempotency key before the request. Once a
response arrives the session binding is persisted before proceeding. On restart,
existing bindings require inspection and prohibit another claim. A pending request
must replay its original key/body; there is no automatic retry or autonomous
execution. A lost local binding must be recovered manually from Dev Queue, not
by creating another worker execution. No secrets are in the persisted binding.

## Remaining required integration

This is a disabled adapter foundation, not a completed coding loop. Before enabling:
- Audit actual installed Cline API and implement documented startup/observation.
- Implement durable outgoing event outbox, heartbeat lifecycle and shutdown.
- Wire observed questions to pause, failures to fail, results to evidence, and
  completion to the server's completion_pending_acceptance response.
- Implement safe reconnect and user attention for ambiguous execution.
- Run VS Code extension-host security/reload tests, a disposable repository real
  Cline edit/test fixture, then a non-critical repository dogfood test.

The client exposes these operations but the disabled adapter does not invoke them.
No running heartbeat or execution is claimed. No GPT, autonomous approval, retry,
merge or deployment is included.
