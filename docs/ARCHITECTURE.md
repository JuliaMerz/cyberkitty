# Architecture and technical decisions

Julia left technical choices to Claude. This file records them, and why, so later work can follow or revisit them. Product behaviour lives in the spec.

## Process layout

- **Main process** (`src/main`): owns the book folder, the sidecars, hidden history, settings, the API key and the model gateway. It is the only process that touches the disk or the network.
- **Preload** (`src/preload`): exposes a typed bridge, `window.ck`, defined by `CkApi` in `src/shared/types.ts`. The renderer is sandboxed with context isolation and no Node.
- **Renderer** (`src/renderer`): React 19 and CodeMirror 6. Holds no key and makes no network calls. A strict CSP allows only bundled resources; fonts are bundled through `@fontsource`.
- **Shared** (`src/shared`): pure modules used by both sides and unit tested: anchors, Markdown conventions, prompts, pricing, defaults.

Build: `electron-vite` (Vite for all three targets). The preload is emitted as CommonJS because sandboxed preloads require it. Packaging: `electron-builder`, publishing to GitHub Releases.

## The book on disk

Markdown is the source of truth. Chapters are folders under `manuscript/`, numbered by prefix (`01-the-harbor`). A scene is `NN-slug.md` (prose only) plus `NN-slug.notes.md` (scratchpad); either may be missing. Titles come from each file's first `# ` heading. A new scene starts as notes only.

Everything else is under `.cyberkitty/`: sidecars at `.cyberkitty/scenes/<chapter>/<scene>.json` and history at `.cyberkitty/history.git`.

## Marks and the self-healing sidecar

- A mark (`MarkRecord`) stores the words it covers plus up to 40 characters of context either side and a position hint. Nothing is written into the Markdown.
- While a scene is open, CodeMirror maps marks through every edit (`marksField`). On save, marks are re-anchored to the words they cover now.
- When a file changes outside the app, or when a scene is opened, `healMarks` re-attaches each mark: exact quote first (context picks between repeats, distance breaks ties), then the most similar paragraph by trigram Dice ≥ 0.6, otherwise the mark is dropped. Dropping is the safe default: unmatched text counts as the author's and as reviewed.
- Review is per paragraph. A draft creates one `unreviewed` mark per paragraph. Accept in the hover window, or any author edit inside the paragraph (including typing onto either end of it), clears it. Edits made by Claude or by reloading from disk are annotated (`machineEdit`) and never count as review.
- File writes are atomic (temp file then rename). The watcher (chokidar) ignores the app's own writes by comparing against the last text written.

## Model gateway

- One module, `src/main/gateway.ts`, wraps `@anthropic-ai/sdk`. Each lane (planner, writer, writer quick tools, quick tools, background) has a model and effort in settings, with the spec's defaults.
- Requests stream. Writer requests send the style page as the last system block with a cache breakpoint so it is reused across drafts.
- Refusals: requests opt into server-side fallback (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), and a final `refusal` stop reason is shown plainly with a suggestion to rephrase or switch model.
- Cost per call is estimated from usage with list prices in `src/shared/pricing.ts` and added to a per-day spend file in the app's user-data folder. The daily cap will gate background work when background work exists (slice 5).
- `CYBERKITTY_FAKE_WRITER=1` replaces the network call with a local stand-in so tests and demos run without a key.

## API key

Stored with Electron `safeStorage` (OS keychain) in the user-data folder, never in the book. If the OS offers no keychain, the key is kept for the session only. `ANTHROPIC_API_KEY` is honoured as a fallback for development.

## History

`isomorphic-git` with a separate git directory (`.cyberkitty/history.git`) and the book folder as work tree, so an author's own git repository is never touched. Snapshots are taken on open, when work settles (no typing for `settleSeconds`, default 30), before each draft, and on quit. Only Markdown files and sidecars are tracked. Restore points UI comes with slice 5.

## Testing

- `npm test`: Vitest unit tests for anchors and healing, notes conventions, prompts, the book store and history.
- `npm run e2e`: launches the built app with Playwright's Electron driver on a copy of the sample book and the fake writer, drafts, accepts, edits, and makes an outside edit.
