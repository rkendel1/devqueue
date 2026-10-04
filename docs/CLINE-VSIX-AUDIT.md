# Cline 4.1.22 VSIX artifact audit

Date: 2026-10-04. Static artifact inspection, **not runtime execution**.

## Artifact

- Repository artifact: `saoudrizwan.claude-dev-4.1.22 2.vsix`
- Artifact repository revision: `7edfe43d21a04da9ed6ff59a97863c093938e5b7`
- SHA256: `134b54af94e1e4cc6cd07224a61f6873c40c845d9fba1f9e6aa510dd6e2c5382`
- Manifest identity: `saoudrizwan.claude-dev`
- Manifest version: `4.1.22`
- Entrypoint: `extension/dist/extension.js`
- Activation events: `onLanguage`, `onUri`, `onStartupFinished`
- Cline source commit: **not established**. The artifact repository revision is not
  the upstream Cline source revision. Public-distribution provenance/signature has
  not independently been verified; filename/manifest alone do not establish it.

The supplied ZIP was extracted to a temporary audit directory and inspected without
modifying its contents. Reproduce the manifest/symbol evidence with:

```sh
python scripts/audit-cline-vsix.py 'saoudrizwan.claude-dev-4.1.22 2.vsix'
```

## Manifest and commands

package.json contributes 19 commands: cline.plusButtonClicked, mcpButtonClicked,
marketplaceButtonClicked, historyButtonClicked, accountButtonClicked,
settingsButtonClicked, dev.createTestTasks, dev.expireMcpOAuthTokens, addToChat,
addTerminalOutputToChat, focusChatInput, generateGitCommitMessage,
abortGitCommitMessage, explainCode, improveCode, jupyterGenerateCell,
jupyterExplainCell, jupyterImproveCell, openWalkthrough (all with cline prefix).
These are visible command declarations, **not a documented generic task/event API**.
abortGitCommitMessage concerns commit-message generation, not arbitrary task cancellation.

Dependencies include @grpc/grpc-js, @grpc/proto-loader, @grpc/reflection, nice-grpc,
@bufbuild/protobuf and workspace packages @cline/agents, @cline/core, @cline/llms,
@cline/shared. Their presence does not prove an externally accessible runtime/RPC
server. Full dependency metadata is emitted by the read-only audit script.

## Observed activation exports

The bundle exports activate/deactivate/reportRolloutActivation. Static tracing of
activate's return reaches a factory returning exactly these methods:

- startNewTask(prompt, images): clears the current task, posts webview state,
  initializes a task. **Potentially replaces existing work; not safe to invoke blindly.**
- sendMessage(message, images): forwards a messageResponse to an active task; when
  none exists it logs an error. No durable session acknowledgement was established.
- pressPrimaryButton(): forwards yesButtonClicked to the active task.
- pressSecondaryButton(): forwards noButtonClicked to the active task.

An external extension can potentially obtain activation exports using VS Code's
extension activation mechanism. This was **not tested in an extension host**.
The bundled README does not document these as an integration contract. No event,
question subscription, task identity, completion notification, cancellation or
reconnect method is present in this returned object. Button methods are not used
by Dev Queue and must not become automatic approval surrogates.

## Claimed runtime boundary comparison

The user-provided source example refers to `cline rpc ensure --json`,
StartRuntimeSession, SendRuntimeSession and AbortRuntimeSession. Exact-string
inspection of this VSIX's declared bundled entrypoint finds **zero occurrences**
of all four. This is a narrow static observation, not proof that no separate Cline
CLI/SDK distribution supports them. The VSIX and a separately distributed CLI may
have different surfaces/versions; compatibility must be established explicitly.

Matching upstream v4.1.22 source/example could not be retrieved through the connected
GitHub integration: cline/cline is not an authorized repository. No supported CLI
runtime, VS Code executable or model-configured Cline host is available here.
No guessed localhost HTTP/RPC server or private service registry is used.

## Classification

| Interface | Classification | Evidence / decision |
| --- | --- | --- |
| Manifest commands | PUBLIC BUT NOT DOCUMENTED as worker API / OBSERVED ONLY | Contributes commands; no lifecycle contract established |
| startNewTask / sendMessage activation exports | PUBLIC BUT NOT DOCUMENTED / OBSERVED ONLY | Returned by activation; runtime and compatibility not verified |
| Primary/secondary button exports | OBSERVED ONLY / UNSAFE TO DEPEND ON for authority | UI-response semantics, no generic lifecycle/approval contract |
| subscribeToState / partial-message service handlers | INTERNAL / PRIVATE / NOT SAFE TO DEPEND ON | Present in bundle; not activation export or verified external contract |
| abortTask implementation | INTERNAL / PRIVATE / NOT SAFE TO DEPEND ON | Bundle internals do not establish public cancellation |
| StartRuntimeSession / SendRuntimeSession / AbortRuntimeSession | PUBLIC SOURCE ONLY claim, UNVERIFIED | Not observed in declared VSIX entrypoint; matching public example not inspected |
| CLI rpc ensure | UNVERIFIED separate runtime | Not observed in this VSIX entrypoint; no CLI runtime tested |
| Question/input/event/completion transport | No SUPPORTED/DOCUMENTED interface established | Cannot reliably drive full loop from available evidence |

## Adapter decision

**Keep ClineWorker disabled.** Artifact access removes the earlier download blocker,
but does not prove the complete supported runtime boundary. Do not turn internal
protobuf handlers or button-response methods into worker control. A separate public
SDK/RPC adapter is acceptable only after its real distribution, versioned documentation,
session/event/cancellation contract and VSIX compatibility are verified.

Required next inputs: matching public runtime/example source and documentation,
actual compatible CLI/SDK distribution, and a real local VS Code/Cline environment
with protected model configuration. Real execution tests must use a disposable
repository and preserve observed evidence. No private API, scraping, fabricated
execution, PASS-only acceptance or synthetic screenshots were introduced.
