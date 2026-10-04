# UI acceptance — blocked, not passed

Date: 2026-10-04. Baseline: 0b15d9197a218f978633034fce62f9ece4dfd64f.
Environment: Linux sandbox, Node 24.21.0, Playwright 1.63.0, downloaded Chromium
headless shell build 1243. VS Code host not available; Cline remains disabled.

Browser launch failed due to missing libglib-2.0.so.0. Dependency installation
could not resolve Ubuntu package hosts. No application page was exercised in this
browser attempt, and no screenshots were generated. Every UI surface/state/action
and desktop/mobile responsiveness remains NOT VERIFIED, despite passing separate
HTTP/repository tests. No API test is substituted for UI click acceptance.

Core click-based test is tests/ui-local-loop.mjs; run npm run test:ui on a host with
Chromium dependencies. It is unverified and does not yet cover all requested visible
actions or failure/retry screenshot states. See [full coverage report](LOCAL-LOOP-ACCEPTANCE.md).
No claim of full local product acceptance is made.

## Hardening attempt (2026-10-04)

Baseline now 114d35ed727ffa520a790d5e4e7ab75cf54f227b, the landed durable/local
acceptance tree, not older main. Re-ran npm run test:ui: FAIL at Chromium launch
before page load, exit 127. No compatible system browser or VS Code executable was
found. ldd also reports missing NSS/NSPR/GTK/X11/GBM/audio libraries; supplying only
one GLib library is not a compatible browser setup. No unsupported bundled-library
substitution was used. [Action inventory](UI-ACTION-INVENTORY.md) records all current
controls as NOT RUN and expected persisted transitions. No screenshots exist.

Reproducible supported setup on a Linux host with OS package access:

```sh
npm install --package-lock=false
npm --prefix vscode-bridge install
npx playwright install --with-deps chromium
npm run test:ui
```

Package dependency installation was previously blocked by DNS access to Ubuntu
hosts in this sandbox. This remains an explicit environmental requirement, not
permission to mock browser evidence. VS Code-host acceptance: NOT RUN; no code
executable/extension host available. Full Definition of Done: **NOT COMPLETE**.
