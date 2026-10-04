# UI action acceptance inventory — not yet browser-verified

Date: 2026-10-04. Baseline 114d35ed727ffa520a790d5e4e7ab75cf54f227b.
Chromium launch fails before page load; every observed-browser/persisted-UI result
below is **NOT RUN**, not an API-test substitute. This inventory is the remaining
acceptance checklist, not a completion claim.

| Control | Initial state/action | Expected transition/persistence | Observed browser result |
| --- | --- | --- | --- |
| Project selector | Select existing project | Queue reload; details reset; server validates project | NOT RUN |
| Create Project | Empty project list, fill fields, submit | Durable Project with path/goal/branch | NOT RUN |
| Load selected project into editor | Selected project | Existing fields populate editor | NOT RUN |
| Update selected project | Change goal/path | Persisted project update | NOT RUN |
| Save task/create | Selected project, complete fields | Durable queued PR, independent specification/criteria | NOT RUN |
| Required field validation | Empty title/objective | Browser rejects form; no PR created | NOT RUN |
| Edit | Existing queued/running PR | Editor populates; immutable session snapshot unchanged | NOT RUN |
| Save task/edit | Change allowed fields | PR changes, packet does not | NOT RUN |
| Priority/position | Numeric input and save | Durable numeric fields; server selection authoritative | NOT RUN |
| Dependencies | Enter PR identities | Durable dependencies; unsatisfied task blocked | NOT RUN |
| Up/down | Interior queue item | Durable order swap | NOT RUN |
| Up/down disabled | First/last item | Boundary action disabled; no state mutation | NOT RUN |
| Delete | Inactive PR, confirm | PR removed; active work refused server-side | NOT RUN |
| Retry failed task | Failed attempt, explicit click | PR queued; new claim/session; old history intact | NOT RUN |
| Inspect project execution | Selected project | Server sessions/events/gates shown | NOT RUN |
| Answer | Waiting question, prompt input | Decision durable; session resumes; reload retains answer | NOT RUN |
| Answer cancelled | Waiting question, cancel | Remains waiting | NOT RUN |
| Run acceptance gates | Completion request, confirm | Real gate evidence; PASS done / FAIL failed | NOT RUN |
| Acceptance cancelled | Completion request, reject confirm | No command admitted | NOT RUN |
| Empty/unsupported criteria | Requested completion | No done; explicit server error | NOT RUN |
| Request Stop | Active task | Stop fence persisted, not fake process termination | NOT RUN |
| Project navigation/reload | Change project or reload | Server state persists; explicit selection required | NOT RUN |
| Desktop/mobile controls | 1440x1000 / 390x844 | Core controls reachable; no blocking overflow | NOT RUN |

Screenshot inventory: zero. Required overview/queued/running/waiting/attention/
answered/gates/done/failed/retry/dependency/mobile images have NOT been captured.
Existing tests/ui-local-loop.mjs is only a core scenario; completing this entire
inventory still requires additional browser tests on a supported host.
