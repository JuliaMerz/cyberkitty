# CyberKitty v2

Electron + TypeScript + React + CodeMirror 6 desktop app for co-writing novels with Claude. Read `docs/ARCHITECTURE.md` before changing structure, and `docs/PLAN.md` for slice order. The product spec lives outside the repo (a Claude Doc); the 2023 prototype in `legacy-v1/` is reference only.

- `npm test`, `npm run typecheck`, `npm run build`, then `xvfb-run -a npm run e2e` on Linux.
- Claude models only, through `src/main/gateway.ts`. The renderer never calls the network.
- Markdown files are the source of truth. Never write ids or markup into them; sidecar state must heal against outside edits.
- Marks use one vocabulary everywhere: unreviewed, updated, suggested, conflict (later tell, gap, decided), listed in that order in the key on every page.
- Anything Claude does to the author's words is a mark or a suggestion, never a silent change.
