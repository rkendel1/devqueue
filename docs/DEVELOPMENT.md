# Development

Start with [Operating Dev Queue](OPERATING-DEV-QUEUE.md). Technical references:
[worker protocol](../WORKER_PROTOCOL.md) and [Cline bridge](CLINE-BRIDGE.md).

## Clean checkout

Use Node.js 24 for the Node test runner's TypeScript support used by the existing
selection tests. Root packageManager declares pnpm@12.3.4 and includes pnpm-lock.yaml;
there is no root package-lock.json. The requested npm installation path is:

```sh
npm install --package-lock=false
npm test
npm run typecheck
npm run build
npm run test:worker-http
```

`npm install --package-lock=false` is the npm install command without introducing
a conflicting root lockfile. Prefer the repository's pnpm lock for reproducible
resolution; npm installation may resolve semver ranges differently. Never change
registry authentication to make installation work.

These checks require no managed account or production credentials. npm test uses
real FeltDB FileJsDb in temporary directories, not a mocked database. The worker
HTTP test launches real local Next dev/start servers on 127.0.0.1:3187, generates
local credentials in process, persists real FeltDB records, terminates/restarts
the server, inspects evidence, then verifies production fail-closed behavior.
Keep port 3187 free. It does not execute Cline or test production authority.
Build success is not proof of production authentication or database connectivity.

## Local authenticated server

Copy `.env.example` to `.env.local` (ignored by Git); populate secrets through
protected local environment storage. Generate distinct random tokens of at least
32 characters outside source control. No working credentials are supplied here.

| Variable | Meaning |
| --- | --- |
| DEV_QUEUE_LOCAL_AUTH | Set exactly enabled to opt into authenticated local mode |
| DEV_QUEUE_LOCAL_DATA_PATH | Absolute persistent file path on this machine; FileJsDb local authority, one Node process |
| DEV_QUEUE_LOCAL_HUMAN_TOKEN | Separate human bearer token for project/queue APIs |
| DEV_QUEUE_LOCAL_WORKERS | JSON array with id, token and projects (actual project ID grants); token must differ from human token |
| FELTDB_URL / FELTDB_TOKEN | Alternative remote authority URL and server-only data token; not worker credentials |
| FELTDB_APPLICATION_ID / FELTDB_ENVIRONMENT | Optional remote authority scope/environment |
| DEV_QUEUE_REPOSITORY_PATH | Absolute worker repository path used by default-project creation |

If local file authority is not opted in, the server needs an authenticated durable
remote FeltDB authority. `.env.example` supplies field names, not valid tokens.
Remote provisioning is not performed. Production rejects local mode and requires real remote authority plus deployment
operator configuration. Worker identities/grants are durable FeltDB records.

```sh
npm run feltdb:validate
npm run dev -- --hostname 127.0.0.1
```

Human API requests need `Authorization: Bearer <human-token>` (inject securely in a
local client, never URL parameters or committed snippets). Create projects with
name, goal, repositoryPath and defaultBranch. GET /api/projects obtains record IDs;
PATCH /api/projects/:id updates the repository path. Local worker grants must name
those IDs. Queue requests require explicit projectId. The human UI selects projects and
edits specification/criteria independently; its credential input is memory-only. See operator guide before assuming
a custom project is selectable in the UI.

For independent protocol verification run `npm run test:worker-http`; its generated
tokens do not need your manual local setup. Do not point this fixture at a production
repository or hosted instance. No testing procedure removes production guards.

## VS Code bridge

```sh
cd vscode-bridge
npm install
npm run typecheck
npm run build
npm test
```

Extension package-lock.json exists, unlike the root. Open this folder in VS Code,
then Run and Debug → Run Dev Queue Bridge. `.vscode/launch.json` uses the included
npm build task. The Development Host is where the trusted single-root disposable
repo is opened. Configure devQueue.endpoint / devQueue.projectId and run Configure
Worker to populate SecretStorage with the dedicated local worker token.

Current Start Next Task refuses before claim due to the disabled Cline adapter.
Do not enable connect() without a supported installed-version audit and real tests.

## Test requirements and verification boundaries

| Check | Requirements / what it proves |
| --- | --- |
| npm test | No external services; temp real FeltDB file persistence, ownership/concurrency/replay/selection + docs consistency |
| npm run typecheck / npm run build | Dependencies installed; no running authority; application compilation only |
| npm run test:worker-http | Real local Next server spawned by test, free port 3187, generated local auth + FeltDB persistence; no managed credentials |
| Extension npm test | No external services/VS Code; filesystem and fixture HTTP client tests, disabled adapter guard |
| Extension typecheck / build | Installed @types/vscode; compilation only, not extension-host execution |
| Remote authority integration | Provisioned authenticated FeltDB URL/token, scope and validated contract; not verified by local tests |
| VS Code extension-host/reload tests | Real VS Code; not available in sandbox |
| Disposable repo Cline fixture / dogfood | Real audited installed Cline public task/event interface + VS Code; blocked, not replaced by fake execution |
| Hosted URL browser verification | Human browser access; CLI alias Ready evidence is not a runtime/UI verification |

No real Cline execution tests have passed. No acceptance-enforcement, GPT escalation,
automatic retry, pause/resume, auto-merge or Dev Queue auto-deploy exists.

### Local credential configuration shape (not usable credentials)

In your protected local environment, DEV_QUEUE_LOCAL_WORKERS must be a JSON string
with this shape; replace every placeholder locally and do not commit the result:

```json
[{"id":"local-worker","token":"<distinct-random-worker-token>","projects":["default-project"]}]
```

Use a distinct random value for DEV_QUEUE_LOCAL_HUMAN_TOKEN. Create the project
first through the human API, then use its actual ID in worker project grants.
The project repositoryPath is the worker machine's authorized absolute path.
There is no implicit project creation or default-project queue fallback.

Local test identities are config-defined; production identities/grants are durable
FeltDB records provisioned by human authority. There is no worker sign-up flow. Reconfigure the
local server after changing grants. VS Code Configure Worker stores only the
worker token, while endpoint/project are ordinary non-secret settings. A human
token is not accepted as worker identity unless someone incorrectly duplicates
it into worker configuration; the authenticator rejects such duplication.

## Production authority and authentication

feltdb.config.json is runtime/application configuration; feltdb.contract.json is
the SDK-generated candidate schema/contract, never a credential. Existing database()
already consumes FELTDB_URL, FELTDB_TOKEN, FELTDB_APPLICATION_ID and FELTDB_ENVIRONMENT.
Production validates HTTPS and explicit application/environment, and never opts
into local file storage. Preview should receive preview-specific authority scope
through the same names. No NEXT_PUBLIC_ token is allowed.

Provision the actual FeltDB authority and activate/validate the extended contract
before enabling hosted operation. Set variables in [prism Environment Variables](https://vercel.com/votersvoices1-6569s-projects/prism/settings/environment-variables),
separately for Preview and Production. Production application/environment may be
FELTDB_APPLICATION_ID=dev-queue and FELTDB_ENVIRONMENT=production **only if those
are real provisioned identities**. FELTDB_URL/TOKEN must come from that authority.
Also set DEV_QUEUE_HUMAN_TOKEN_SHA256 to the SHA-256 of a distinct randomly generated
operator token. Keep the original operator token protected; no shared worker key.

Human GET /api/readiness verifies canonical application discovery and returns only
ready/applicationId/environment. Worker GET /api/worker-sessions/readiness?projectId
checks identity, persisted project grant and repositoryPath without modifying state.
No URL/token/digest is exposed in readiness. Missing/invalid/unavailable authority
fails 503; invalid worker fails 401; unauthorized project fails 403.

Credential lifecycle: human POST /api/workers with name/projectIds/operator-generated
opaque token stores only SHA-256 verification data; response is metadata only.
Human GET /api/workers/:id inspects safe metadata, DELETE revokes. Workers cannot
call human routes. No production secrets are changed by this PR.

The older default-project setup notes above are superseded: every queue request now
requires an explicit projectId and does not create a hidden project. Create a project
first, use its returned ID in worker grants and bridge settings. Existing local
protocol test fixtures retain their own explicitly named projects.
