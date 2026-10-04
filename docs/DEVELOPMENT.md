# Development

Node 24; root pnpm lock or `npm install --package-lock=false`.

```sh
npm test
npm run typecheck
npm run build
npm run test:worker-http
```

```sh
cd vscode-bridge
npm install
npm run typecheck
npm run build
npm test
```

Local runtime: existing createFeltDB mode=local, persistent
DEV_QUEUE_LOCAL_DATA_PATH (default .dev-queue/data). No remote URL/token/app/environment
or production operator configuration needed. DEV_QUEUE_WORKER_TOKEN is the single
local worker bearer token; DEV_QUEUE_REPOSITORY_PATH is repository configuration.
feltdb.config.json remains local configuration, feltdb.flow/contract remain schema,
not secrets. WorkerRequest receipts and session packet/sequence/heartbeat fields
remain because durability, retries and audit need them—not hosted IAM.

Tests use real local FeltDB temporary files, reopen/restart and local HTTP; no external
services. VS Code/Cline host tests and full coding/acceptance loop remain unverified.
Never expose the local server through a reverse proxy. Binding loopback is mandatory.
