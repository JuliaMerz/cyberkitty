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

Direction pages (`summary.md`, `theme.md`, `tropes.md`, `characters.md`, `outline.md`), `style.md` and `bible.md` (the author's planned facts) sit at the top of the book folder. A chapter's intent is its `chapter.md` below the title.

The story bible is Markdown too (`src/shared/biblemd.ts`): `bible/characters.md`, `events.md`, `movements.md`, `places.md` and `world.md`, a `## ` heading per subject and a bullet per fact, with story time, a movement's from → to and the source scene in a trailing `_( … )_`. No ids. `.cyberkitty/bible.json` keeps what Markdown cannot: ids, the quote behind each derived fact, history, corrections, Claude's ideas still waiting (they enter the files only once kept), and the line each fact was last written as. Every read heals the sidecar against the files: an unchanged line is the same fact; a changed line under the same heading is the author's correction (it sticks, as a correction in the app does); the same words under another heading is a move; a new line is a new fact of the author's; a missing line is a removal; a missing file teaches nothing. Every update writes the files again; a read leaves the author's wording alone. History tracks `bible.json` with the files, so a restore brings back both.

Export (`src/main/export.ts`, File > Export as Markdown) writes one Markdown file each for the manuscript (chapter headings, scenes' prose in order with `* * *` between scenes, no notes or scene titles), the notes and planning (book pages, then each chapter's intent and scene notes under their titles, headings nested one level down), and the story bible (planned page plus the bible files).

Everything else is under `.cyberkitty/`: scene sidecars at `.cyberkitty/scenes/<chapter>/<scene>.json`, sidecars for pages and chapters at `.cyberkitty/docs/`, the event log `log.jsonl`, app data as JSON (`chat.json`, `bible.json` (the bible's sidecar), `summaries.json`, `alerts.json`, `changes.json`, `diagrams.json`, `scan.json`, `direction-seen.json`), the corrections log `corrections.jsonl`, and history at `.cyberkitty/history.git`. Bible entries and summaries are derived and rebuild from the Markdown; losing any of it loses review state or chat, never words.

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
- File writes are atomic (temp file then rename). On Windows the rename is refused for a moment while OneDrive, a virus scanner or another editor holds the file (EPERM, EBUSY, EACCES), so it is retried for about two seconds and then the file is written in place. A save that still fails shows a notice on the editor and is retried every few seconds; the words stay in the editor meanwhile. The watcher (chokidar) ignores the app's own writes by comparing against the last text written.
- A streamed draft goes into the open editor piece by piece, at a place that moves with the author's own edits (typing above the draft shifts it). If the author leaves the scene mid-draft, the editor hands the draft to the main process (`draft:detach`, `src/main/drafts.ts`), which writes the rest into the file, finding its place each time by the end of what it has written so far, and marks the drafted paragraphs unreviewed when it is done.

## Model gateway

- One module, `src/main/gateway.ts`, wraps `@anthropic-ai/sdk`. Each lane (planner, writer, writer quick tools, quick tools, background) has a model and effort in settings, with the spec's defaults.
- Requests stream. Prompt caching is laid out in "Prompt caching" below.
- Refusals: requests opt into server-side fallback (`server-side-fallback-2026-07-01`, `fallbacks: "default"`), and a final `refusal` stop reason is shown plainly with a suggestion to rephrase or switch model.
- Cost per call is estimated from usage with list prices in `src/shared/pricing.ts` (cache reads at the cache price, 5-minute writes at 1.25x input, 1-hour writes at 2x) and added to a per-day spend file in the app's user-data folder, with today's prompt tokens split into uncached, read from cache and written to cache (`tokens.json`). Settings shows that split, which is the check that caching works. The daily cap gates background work.
- Three call shapes: `streamText` (drafts, rewrites, ghost text), `structured` (JSON output through `output_config.format` for alternatives, settling, the scan, change specs, diagrams; replaces v1's regex parsing) and `agentTurn` (one step of the planner's tool loop).
- Background work (settling, the scan) is marked `background` and refused once the daily cap is reached.
- `CYBERKITTY_FAKE_WRITER=1` replaces the network call with a local stand-in so tests and demos run without a key. `CYBERKITTY_FAKE_DELAY_MS` slows its stream for tests that act while a draft streams.
- Errors read as words: an overloaded or failing server (529, 5xx, or an error event mid-stream) is "Claude is busy right now", other API errors give Anthropic's message rather than the JSON body.
- A new book's style page holds instructions for the author under Samples and Description. Until the author replaces them, the writer and the planner get the page without them (`src/shared/style.ts`), and the writer is told no samples or description exist yet. The starter ban list is kept.

## API key

Stored with Electron `safeStorage` (OS keychain) in the user-data folder, never in the book. Saving checks the key first by listing one model (a free call): a key Anthropic turns down is not saved, and if Anthropic cannot be reached the key is saved with a note that it is unchecked. If the OS offers no keychain, the key is kept for the session only. `ANTHROPIC_API_KEY` is honoured as a fallback for development.

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

What happened in the book, in order (`src/main/eventlog.ts`). Each event is rendered to text once, with a `[YYYY-MM-DD HH:MM]` stamp and a kind (chat, reply, action, edit, review, bible, alert, error), and never re-rendered, so the log only grows. It is also appended to `.cyberkitty/log.jsonl`, the book's command history.

Nothing reaches Claude except through one of four routes, each with a single entry point, so a new feature cannot bypass the log by accident:

- **Actions: one table.** Every channel the UI can call is in `src/main/actions.ts`, either with the words the log uses or marked quiet with the reason (a read, or logged by another route). `index.ts` registers channels only through `handle` and `on`, which apply the table in one order: save the UI's held-back typing, log the edits before the action, log the action, run it, log what it changed or that it failed. `test/actions.test.ts` fails when a preload channel is missing from the table or registered around it.
- **Text: comparison.** Edits are not logged per keystroke. Before and after each action, at every Claude call that reads the log, and when work settles, each document is compared with how it read last time; the changed paragraphs are logged in full as they read now (`src/shared/edits.ts`: "now reads … (was …)", "added after …", "removed"), with Claude's unreviewed or updated paragraphs tagged. This catches every edit whatever made it: typing, a draft, a merge, a restore, another editor. Comparisons run one at a time and never throw.
- **Marks: one write point.** Every mark write goes through `Book.writeDocMarks`, which tells the log. A new suggestion is logged when it appears; when one of Claude's marks goes, the next comparison logs whether the suggestion was taken or Claude's words were accepted as they are. A suggestion made and rejected within seconds is still logged.
- **App data: store writes.** Alerts, todos and the bible change only through their store's `update`, which hands the log the before and after. The bible's store also reports edits made to its Markdown files elsewhere, when a read heals them in (every comparison reads it). Alerts record who changed their status (`statusBy`), so the log can tell the author's dismissal from an alert closing itself. Bible entries derived from the text are left out (the edits behind them are logged); the author's, the planner's and corrected ones are logged.

The planner logs its own chat turns: the author's message, its tool actions, its reply, a stop with what the author saw, and a failed reply.

Before anything that reads the book (every Claude call, closing or switching the book, quitting), the main process asks the UI to save the typing it is still holding back (editors save 400ms after the last keystroke) and waits for the answer (`flushUi`). Closing the window waits the same way, so the last words before a quit are kept.

Events fall into batches. A batch closes whenever a call reads the log, so a prompt carries one block per batch, and the previous call's cache entry is found by the lookback.

What a snapshot keeps besides the text, so a retaken snapshot or a restart loses only detail, never state:
- each document's review state: Claude's words not reviewed yet, updated passages, and suggestions waiting for the author (`reviewStateText`; the planner's `read_doc` returns it too);
- the open alerts and the conversation;
- the latest 40 actions, reviews, alerts and failures before it, read back from `log.jsonl` across sessions.

## Prompt caching

Caching is a prefix match: one changed byte invalidates everything after it. The book changes constantly, so every call that carries it is laid out from never-changing to always-changing:

1. The guide and the role's instructions (plus the style page for the writer). Static; cached 1 hour.
2. A frozen snapshot of the whole book (`src/main/snapshot.ts`), with the open alerts and the conversation as they stood when it was taken. Byte-identical from call to call; cached 1 hour.
3. The event log since the snapshot, one block per batch. The cache point (1 hour) sits on the newest block, as late as possible, because the history never changes once written. Earlier blocks are a prefix of later calls.
4. The task, carrying the current text of whatever it acts on (the scene being drafted, the passage being rewritten, recent corrections). Never cached.

The scan works differently. It gets the current text of each changed document (scene, page, chapter intent; bible entries as lines; the table of contents when scenes were added or removed), labelled as replacing the snapshot's version, rather than the history, plus the conversation in its snapshot and the chat since, so it can see what the author has said is deliberate. Change specs get the whole current book in history mode (review state, alerts, conversation, recent actions), since a change usually grows out of the chat. It checks the book as it reads now, and `fileAlert` verifies every quote against the current text, so a quote from a superseded version is never filed.

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

- `npm test`: Vitest unit tests for anchors and healing, notes conventions, prompts, the book store, history and restore, tells, links, quote location, bible merging, SVG sanitizing, alert keys, the change diff, the event log and prompt caching, and the action table.
- `npm run e2e`: launches the built app with Playwright's Electron driver on a copy of the sample book and the stand-in model, and walks the v1: draft, accept, edit, outside edit, a humanize suggestion, a chat suggestion, the bible and timeline, a todo, a direction page, a chapter change with merge and undo, history and diagrams.
