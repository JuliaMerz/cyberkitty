# CyberKitty

Write a novel with Claude, in your own voice.

CyberKitty is a desktop app for writing fiction with Claude one scene at a time. Your book is a folder of plain Markdown files on your computer, you bring your own Anthropic API key, and nothing leaves your machine except the text sent to Anthropic.

> This is v2, a rebuild. The 2023 prototype is kept in [`legacy-v1/`](legacy-v1/) for reference.

## What v1 does

**Writing a scene**
- Chapters and scenes in the left rail. A scene is two Markdown files side by side: its notes (the scratchpad) and its prose. An Obsidian-style live-preview editor; Markdown syntax fades until the cursor is on it.
- **Draft it**: the writer drafts from your notes and your style page, streamed into the prose file. Select notes to draft only those beats, or put the cursor on a `[bracketed gap]`. Quoted lines in the notes are pinned and used word for word.
- Everything Claude wrote is shaded **unreviewed**, per paragraph. Hover a shade for small buttons: Accept, other ways to say the sentence, talk about it in chat. Typing in a paragraph also makes it yours.
- Select any text for the toolbar: Comment (attach it to chat), Plainer, Shorter, Rougher, More concrete, Like my samples, Alternatives. Rewrites arrive as **suggestions**: the old words struck, the new ones dashed and paler, Accept or Reject on hover.
- Phrases on the style page's ban list, and common AI tells, are underlined as **tells**. Your rewrites of Claude's paragraphs are logged and fed back to the writer as examples.
- Optional ghost text suggests the next sentence as you write (Settings; Tab takes it).

**Talking it through**
- One chat for the whole book, beside every page. It knows the page, paragraph and selection you are on. Claude acts on the page only through suggestions, and never writes prose itself: it briefs the writer. Links in its replies go to the passage, wearing that passage's mark.

**The book around the scene**
- Direction pages: summary, theme, tropes, characters and arcs, outline, style. Plain Markdown files at the top of the book folder.
- Chapter pages: what the chapter is for, its scenes with summaries Claude keeps up to date, and chapter-scale changes: Claude writes a change spec you edit and approve, the writer rewrites, and you review paragraph diffs before anything merges. The whole change is one undo.
- Story bible and timeline, filled in from the text as your work settles, with a link to the words behind every fact. Correct anything and it sticks. Plan entries by hand in `bible.md`. Claude's own ideas wait as unreviewed until you keep or dismiss them.
- Alerts: when you leave a chapter or pause, Claude reads the whole book and files what no longer fits, quoting both sides. Fix either side and the alert closes itself. Also: outline entries the writing has left behind, scenes written before a direction page changed, todos, and passages of yours proposed as style samples.
- Maps and diagrams drawn from the bible. Import Markdown files as scenes. History with restore points.

**Underneath**
- Review state lives in self-healing sidecars under `.cyberkitty/`. Edit the Markdown anywhere and the marks find their way back.
- Hidden history in `.cyberkitty/history.git`; your own git is untouched.
- Settings: API key (OS keychain), model and effort per kind of work, daily spending cap for background work, how much Claude volunteers, pause lengths.

Not built yet: voice. See [docs/PLAN.md](docs/PLAN.md).

The plan for the next slices is in [docs/PLAN.md](docs/PLAN.md), and the reasoning behind technical choices is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## A book on disk

```
book.md                                        # Title
summary.md theme.md tropes.md characters.md outline.md   direction pages
style.md                                       the style page, read by every writing prompt
bible.md                                       planned bible entries, by hand
manuscript/01-the-harbor/chapter.md            # The Harbor
manuscript/01-the-harbor/01-arrival.md         prose only
manuscript/01-the-harbor/01-arrival.notes.md   the scratchpad
.cyberkitty/                                   sidecars, chat, bible, alerts and history; safe to delete (you lose review state, never words)
```

## Development

Requires Node 22.

**Windows:** if `npm install` stops while downloading Electron (behind a proxy or antivirus), run `node node_modules/electron/install.js` once the rest has installed, then `npm install` again. If that also fails, set `ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/` and retry.

```
npm install
npm run dev          # run the app with hot reload
npm test             # unit tests
npm run typecheck
npm run build && npm run e2e   # end-to-end smoke test (needs the playwright package; on Linux use xvfb-run)
```

`CYBERKITTY_FAKE_WRITER=1` swaps in a stand-in for every Claude call, so the whole app runs without a key. `CYBERKITTY_BOOK=/path/to/book` opens a book at launch.

## Releases

Push a tag such as `v0.1.0`. GitHub Actions builds macOS, Windows and Linux installers and attaches them to a draft GitHub Release. Builds are unsigned for now: on macOS, right-click the app and choose Open the first time.
