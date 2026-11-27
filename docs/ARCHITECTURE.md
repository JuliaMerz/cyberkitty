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

Direction pages (`summary.md`, `theme.md`, `tropes.md`, `characters.md`, `outline.md`), `style.md` and `bible.md` sit at the top of the book folder. A chapter's intent is its `chapter.md` below the title.

Everything else is under `.cyberkitty/`: scene sidecars at `.cyberkitty/scenes/<chapter>/<scene>.json`, sidecars for pages and chapters at `.cyberkitty/docs/`, the event log `log.jsonl`, app data as JSON (`chat.json`, `bible.json`, `summaries.json`, `alerts.json`, `changes.json`, `diagrams.json`, `scan.json`, `direction-seen.json`), the corrections log `corrections.jsonl`, and history at `.cyberkitty/history.git`. Bible entries and summaries are derived and rebuild from the Markdown; losing any of it loses review state or chat, never words.

Every editable document is addressed by a `DocRef` (a scene file, a chapter intent or a page) and keyed by `docKey`. One renderer component, `DocEditor`, edits any of them.

## Marks and the self-healing sidecar

- A mark (`MarkRecord`) stores the words it covers plus up to 40 characters of context either side and a position hint. Nothing is written into the Markdown.
- While a scene is open, CodeMirror maps marks through every edit (`marksField`). On save, marks are re-anchored to the words they cover now.
- When a file changes outside the app, or when a scene is opened, `healMarks` re-attaches each mark: exact quote first (context picks between repeats, distance breaks ties), then the most similar paragraph by trigram Dice ≥ 0.6, otherwise the mark is dropped. Dropping is the safe default: unmatched text counts as the author's and as reviewed.
- Review is per paragraph. A draft creates one `unreviewed` mark per paragraph. Accept in the hover window, or any author edit inside the paragraph (including typing onto either end of it), clears it. Edits made by Claude or by reloading from disk are annotated (`machineEdit`) and never count as review.
- Suggestions (`suggested`) are marks whose words are not in the file yet: the record carries a `replacement`, and `insert: 'after'` for additions. The editor strikes the anchored words and shows the replacement as a dashed widget. Accept writes it into the file; accepting is reviewing, so no mark stays. Reject drops it.
- Conflict marks belong to an alert (`alertId`) and clear when the alert is done or dismissed.
- Tells and gaps are derived on the fly in the editor, never stored.
- Who owns a sidecar: while a document is open in the UI, the UI does (it maps marks through edits). Marks created in the main process (chat suggestions, conflicts) are sent to the open editor (`marks-added`), and written to the sidecar directly only when the document is closed. This avoids two writers racing on one sidecar.
- File writes are atomic (temp file then rename). The watcher (chokidar) ignores the app's own writes by comparing against the last text written.

## Model gateway

- One module, `src/main/gateway.ts`, wraps `@anthropic-ai/sdk`. Each lane (planner, writer, writer quick tools, quick tools, background) has a model and effort in settings, with the spec's defaults.
- Requests stream. Prompt caching is laid out in "Prompt caching" below.
- Refusals: requests opt into server-side fallback (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), and a final `refusal` stop reason is shown plainly with a suggestion to rephrase or switch model.
- Cost per call is estimated from usage with list prices in `src/shared/pricing.ts` (cache reads at the cache price, 5-minute writes at 1.25x input, 1-hour writes at 2x) and added to a per-day spend file in the app's user-data folder, with today's prompt tokens split into uncached, read from cache and written to cache (`tokens.json`). Settings shows that split, which is the check that caching works. The daily cap gates background work.
- Three call shapes: `streamText` (drafts, rewrites, ghost text), `structured` (JSON output through `output_config.format` for alternatives, settling, the scan, change specs, diagrams; replaces v1's regex parsing) and `agentTurn` (one step of the planner's tool loop).
- Background work (settling, the scan) is marked `background` and refused once the daily cap is reached.
- `CYBERKITTY_FAKE_WRITER=1` replaces the network call with a local stand-in so tests and demos run without a key.

## API key

Stored with Electron `safeStorage` (OS keychain) in the user-data folder, never in the book. If the OS offers no keychain, the key is kept for the session only. `ANTHROPIC_API_KEY` is honoured as a fallback for development.

## History

`isomorphic-git` with a separate git directory (`.cyberkitty/history.git`) and the book folder as work tree, so an author's own git repository is never touched. Snapshots are taken on open, when work settles (no typing for `settleSeconds`, default 30), before each draft, before and after a change merges, and on quit. Only Markdown files and sidecars are tracked. Restoring writes the old files through the work tree (never moving the branch) between two snapshots, so a restore is itself undoable.

## Prompts

Every Claude call starts with one guide (`src/shared/briefing.ts`). The guide describes how the app works rather than how to behave:
- who the Claudes are
- the book on disk
- the screen and the marks
- every page
- the chat and its links
- each planner tool and what the author sees when it is used
- background work
- where the writer's output lands

Each role's own instructions follow the guide: the planner's in `planner.ts`, the writer's in `prompts.ts`, and each background job's next to its code (`jobSystem`).

Context:
- **Planner.** It sees the whole book and the event log.
- **Writer.** It also sees the whole book (direction, the bible, the manuscript with notes, open alerts and the conversation so far, through `writerBookContext`) and the event log after it.
- **Ghost text.** It stays lean, because it has to be fast.
- **Long books.** A full-length novel fits. Past roughly 150k tokens, a snapshot drops notes first, then the prose outside the chapter in focus. Summaries are always kept.

## The event log

What happened in the book, in order (`src/main/eventlog.ts`): the author's chat messages and the planner's replies, actions (Draft it, alternatives, a rewrite or humanize request, a merged or undone chapter change, a restore), Claude's suggestions taken or not taken, Claude's words accepted as they are, edits, bible changes and alerts opening or closing. Each event is rendered to text once, with a `[YYYY-MM-DD HH:MM]` stamp, and never re-rendered, so the log only grows. It is also appended to `.cyberkitty/log.jsonl`, the book's command history.

Edits are not logged per keystroke. When the log is brought up to date (before any action is logged, at every call that reads the log, and when work settles), each document is compared with how it read last time. The changed paragraphs are logged in full as they read now (`src/shared/edits.ts`): "now reads … (was …)", "added after …", "removed". Paragraphs that are Claude's unreviewed or updated words carry a tag. The comparison runs one at a time and never throws, so logging cannot hold up the work it records.

Events fall into batches. A batch closes whenever a call reads the log, so a prompt carries one block per batch, and the previous call's cache entry is found by the lookback.

## Prompt caching

Caching is a prefix match: one changed byte invalidates everything after it. The book changes constantly, so every call that carries it is laid out from never-changing to always-changing:

1. The guide and the role's instructions (plus the style page for the writer). Static; cached 1 hour.
2. A frozen snapshot of the whole book (`src/main/snapshot.ts`), with the open alerts and the conversation as they stood when it was taken. Byte-identical from call to call; cached 1 hour.
3. The event log since the snapshot, one block per batch. The cache point (1 hour) sits on the newest block, as late as possible, because the history never changes once written. Earlier blocks are a prefix of later calls.
4. The task, carrying the current text of whatever it acts on (the scene being drafted, the passage being rewritten, recent corrections). Never cached.

The scan works differently. It gets the current text of each changed document (scene, page, chapter intent; bible entries as lines; the table of contents when scenes were added or removed), labelled as replacing the snapshot's version, rather than the history. It checks the book as it reads now, and `fileAlert` verifies every quote against the current text, so a quote from a superseded version is never filed.

Each role keeps its own snapshot (`writer`, `scan`, `planner`), retaken when:
- the history (or, for the scan, the changes) outgrows 20% of the snapshot (at least 8k characters, at most 120k, about 30k tokens), since carrying it would soon cost more than a fresh 1-hour write, or
- nothing used it for 55 minutes. The 1-hour entry has expired by then, so a fresh snapshot costs nothing extra.

A retake folds the history into the new snapshot, and prompts carry the log only from there on (the file on disk keeps all of it).

Breakpoints stay within the API's rules: at most four per request, and 1-hour entries before 5-minute ones. The guide is its own first block everywhere, so calls on the same model can share it. If many batches pile up between two writer calls (a long chat, say), the lookback can miss the previous entry; the snapshot's own breakpoint still hits, so only the history is written again. Tests in `test/caching.test.ts` pin that the snapshot survives edits and bible changes byte for byte, that the history only appends, that suggestions are logged as taken or not, and that the snapshot is retaken when it should be.

What a cached read costs on a full novel (about 150k tokens): Sonnet $0.015, Opus $0.03. A fresh 1-hour write: Sonnet $0.60, Opus $1.20.

How much Claude volunteers is the author's setting and is passed to the planner as a fact. The prompts do not prescribe a leading or a quiet role.

## The planner

- One long-lived agent session per book (`src/main/planner.ts`). System blocks: the guide, the instructions (1-hour breakpoint), the frozen book snapshot (1 hour), then the event log since the snapshot (1 hour). The conversation is cached automatically, also for 1 hour, since the author replies at a human pace.
- Each author message is an event carrying what happened since the planner last heard (the log, leaving out its own replies and tool use, which it already has), then the place (page, paragraph, selection), attached passages and the message. Past 40k characters the history comes as one line per event, and the planner reads current text with `read_doc`. The message, the reply and each tool use go into the log, so the writer and later sessions see them.
- A new session starts when the last one has been idle 55 minutes (its cache has expired, so a current book costs nothing extra), when the conversation passes 100k tokens beyond the book, or when the API rejects a request. The frozen snapshot is reused while it is warm. A stop or a passing error keeps the session: tool calls that never ran get an error result, and the log tells the planner what the author saw of a stopped reply.
- Tools: `read_doc`, `suggest_edit` and `suggest_insert` (notes, pages, chapter intents; refused on prose), `rewrite_prose` and `draft_prose` (brief the writer; result is a suggestion), `add_bible_idea`, `file_alert`, `add_todo`, `propose_change_spec`, `draw_diagram`. Inputs are validated with zod. Tool results hand back `ck:` links the planner uses in its reply.
- `ck:` links (`src/shared/links.ts`) address scenes, pages, chapters, alerts, changes and bible entries, with an optional quote that is found by matching text, like an anchor.

## Settling and the scan

- Settling runs when the author pauses (`settleSeconds`): a snapshot, then for each scene whose prose changed, one structured call that returns a summary and the facts the scene establishes, each with a verbatim quote. Facts whose quote is not found are dropped. `mergeSceneEntries` replaces what the bible says a scene established, keeps history on changed entries, and leaves the author's corrections alone. Changed chapters are compared with the outline; clear divergences become an alert plus a suggestion on `outline.md`. When a direction page changed, scenes written before it get a verdict each.
- The scan reads the whole book on leaving a chapter, after `scanIdleMinutes` idle, or on demand, and only when the manuscript changed since the last scan. The book rides in the scan's own frozen snapshot (prose, no notes), so a scan pays mostly for what changed. Findings must quote both sides; `fileAlert` verifies every quote, and a dismissal is keyed to the exact pair (`pairKey`) so it is not raised again. Alerts close themselves when their quoted words are gone.

## Chapter-scale changes

Spec (structured call, the author edits it), then the writer rewrites each scene against the spec into the change record, never the file. Review is a paragraph diff (`src/renderer/src/diff.ts`); each change is accepted or kept, and "accept all" brings the rest in marked so it can still be reviewed on the page: `updated` (with the replaced version) where it rewrites a paragraph the author had, `unreviewed` where the paragraph is new. The merge writes files between two history snapshots; undo writes the originals back.

## Testing

- `npm test`: Vitest unit tests for anchors and healing, notes conventions, prompts, the book store, history and restore, tells, links, quote location, bible merging, SVG sanitizing, alert keys, the change diff, and the event log and prompt caching.
- `npm run e2e`: launches the built app with Playwright's Electron driver on a copy of the sample book and the stand-in model, and walks the v1: draft, accept, edit, outside edit, a humanize suggestion, a chat suggestion, the bible and timeline, a todo, a direction page, a chapter change with merge and undo, history and diagrams.
