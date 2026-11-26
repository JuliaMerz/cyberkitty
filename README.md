# CyberKitty

Write a novel with Claude, in your own voice.

CyberKitty is a desktop app for writing fiction with Claude one scene at a time. Your book is a folder of plain Markdown files on your computer, you bring your own Anthropic API key, and nothing leaves your machine except the text sent to Anthropic.

> This is v2, a rebuild. The 2023 prototype is kept in [`legacy-v1/`](legacy-v1/) for reference.

## What works today (slice 1: write one scene)

- Open or create a book folder, or try the bundled sample book.
- Chapters and scenes in the left rail. A scene is two Markdown files side by side: its notes (the scratchpad) and its prose. View notes, prose, or both.
- An Obsidian-style live-preview editor built on CodeMirror 6: Markdown syntax fades until the cursor is on it.
- **Draft it**: Claude (Sonnet 5.5 by default) writes the scene from your notes and your style page, streamed straight into the prose file. Select some notes first to draft only those beats. Put the cursor on a bracketed line such as `[she finds the letter]` to fill that gap.
- A line in the notes that is only a quotation is pinned; the draft must use it verbatim, and you are told if it did not.
- Everything Claude wrote is shaded as **unreviewed**, per paragraph. Hover a shade for a floating Accept button; typing in a paragraph also makes it yours. The key at the bottom lists every mark with counts, and clicking a name steps through them.
- Review state lives in a self-healing sidecar under `.cyberkitty/`. Edit the Markdown anywhere, in Obsidian or a text editor, and the marks find their way back.
- Hidden history: the app snapshots the book into `.cyberkitty/history.git` when work settles and before Claude writes. Your own git, if you use one, is untouched.
- Settings: API key (stored in your OS keychain), model and effort per kind of work, daily spending cap, and a spend meter.

The plan for the next slices is in [docs/PLAN.md](docs/PLAN.md), and the reasoning behind technical choices is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## A book on disk

```
book.md                                        # Title
style.md                                       the style page, read by every writing prompt
manuscript/01-the-harbor/chapter.md            # The Harbor
manuscript/01-the-harbor/01-arrival.md         prose only
manuscript/01-the-harbor/01-arrival.notes.md   the scratchpad
.cyberkitty/                                   sidecars and history; safe to delete (you lose review state, never words)
```

## Development

Requires Node 22.

```
npm install
npm run dev          # run the app with hot reload
npm test             # unit tests
npm run typecheck
npm run build && npm run e2e   # end-to-end smoke test (needs the playwright package; on Linux use xvfb-run)
```

`CYBERKITTY_FAKE_WRITER=1` swaps in a stand-in writer that needs no key. `CYBERKITTY_BOOK=/path/to/book` opens a book at launch.

## Releases

Push a tag such as `v0.1.0`. GitHub Actions builds macOS, Windows and Linux installers and attaches them to a draft GitHub Release. Builds are unsigned for now: on macOS, right-click the app and choose Open the first time.
