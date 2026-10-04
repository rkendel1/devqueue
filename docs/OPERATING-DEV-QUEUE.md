# Operating local Dev Queue

Follow [README startup](../README.md). Dev Queue answers: projects, next PR,
worker activity, and attention. Local FeltDB is authoritative for work; Git for code.

Create a project with name/goal/repositoryPath/defaultBranch. Select it explicitly;
queue reloads and details/inspection clear on change. Create/edit PR number at
creation, title, objective, specification, acceptance criteria, constraints,
dependencies, priority and position. No criteria are manufactured. Up/down changes
durable position. Server chooses next by position, priority, ID and done dependencies.
Delete inactive work; Retry failed task is explicit, never automatic.

Inspect project execution for session ID, project/PR, workerType, workspace,
status/timestamps and durable events with metadata. Waiting questions appear under
ATTENTION REQUIRED; Answer commits a Decision and resumes session/PR atomically.
Worker reads its decisions; no GPT supplies answers. Result and completion requests
are evidence, not approval. Actual acceptance enforcement is not implemented.

VS Code commands: Dev Queue: Configure Worker, Dev Queue: Test Connection,
Dev Queue: Start Next Task, Dev Queue: Inspect Existing Session. Only endpoint and
project ID are settings; credential is SecretStorage, never URLs/TaskPackets/Git.
Wrong/multi-root/remote/untrusted workspace is refused. Restart does not automatically
resume or duplicate a claim. Inspect bindings rather than clearing them to force work.

## Cline integration — current blocker

Cline version tested: none. No installed VSIX/public execution/event interface was
available. Cline connect refusal remains. No UI scraping, keyboard automation,
private APIs or fabricated events. Provide exact version/VSIX and documented public
execution/event interface before the adapter can run. Active heartbeat/outbox and
pause/resume are not complete. GPT escalation, automatic retry, auto-merge and
auto-deploy are not implemented.

No projects: create one. Missing worker credential: configure the local server token
and enter the same token in SecretStorage. Workspace mismatch: open the project's
canonical repository directory. Waiting: answer locally; do not fabricate tests.
Completion pending: acceptance gates are not available, so done is correctly refused.

This is local only; historical https://prism-nine-jade.vercel.app is not required or
claimed operational by this product. No hosted setup/readiness/IAM is exposed.
