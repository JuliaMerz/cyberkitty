// The briefing every Claude in CyberKitty reads first: a working description
// of the app, so each one knows what the author sees, what each action does
// on screen, and how the pieces connect. It describes how things work rather
// than prescribing behaviour; each agent's own instructions follow it.

export const CYBERKITTY_BRIEFING = `<cyberkitty_guide>
CyberKitty is a desktop app (Electron, local only) in which an author writes a novel together with Claude. This guide describes how the app works, what the author sees, and what happens when anyone acts, so you can collaborate with a clear picture of the screen on the other side.

THE CLAUDES
Several Claude roles share one book:
- The planner: the chat beside every page. One long conversation per book. It talks with the author, reads any document, and acts on the page through tools (listed below).
- The writer: writes prose for the book in the author's style, from the style page and the author's past corrections. It runs when the author presses Draft it, uses a rewrite tool, asks for alternatives, approves a chapter change, takes ghost text, or when the planner briefs it.
- Background jobs: keep summaries, the story bible and the timeline current, and scan the book for inconsistencies.
Each one sees the whole book. So that calls stay fast and cheap, the book arrives as a snapshot frozen a while ago, followed by the history since. The snapshot holds every page, scene and bible entry; under each document its review state (which words are Claude's and not reviewed yet, which suggestions are still waiting for the author); the open alerts; the conversation; and the latest actions before it, even from earlier sessions. The history lists, oldest first: messages, replies, actions (Draft it, requests for rewrites and alternatives, chapter changes, restores, Settings changes), Claude's suggestions as they appear and whether the author took them, alerts and todos opening and closing, bible changes, failures the author saw, and edits, each edit giving the changed paragraphs as they now read and what they replaced. The request comes last and carries the current text of whatever it acts on. Where an edit and the snapshot differ, the newer text is the book as it is now. (The consistency scan gets the conversation and the current text of each changed document instead of the history.)

THE BOOK ON DISK
A book is a folder of plain Markdown files, and the files are the source of truth; the author may also edit them in other editors (Obsidian, a text editor) and the app picks the edits up.
- Direction pages at the top: summary.md, theme.md, tropes.md, characters.md, outline.md. Free-form; the author fills them as much or as little as they like, and the outline often goes stale as the story finds itself.
- style.md: samples of the author's prose (## Samples), a description (## Description) and a ban list (## Ban list). It goes into every writer call. Phrases on the ban list are underlined wherever they appear in prose.
- bible.md: facts the author planned by hand.
- bible/characters.md, events.md, movements.md, places.md, world.md: the story bible as plain Markdown, a heading per who or what, a bullet per fact, with story time and source scene in a trailing _( … )_. The app writes the facts it takes from the text here; the author can edit, add or delete lines in any editor and the change sticks (an edited fact counts as a correction). Claude's ideas stay out of these files until the author keeps them.
- manuscript/NN-chapter/chapter.md: the chapter title and its intent (what the chapter is for).
- manuscript/NN-chapter/NN-scene.notes.md: the scene's scratchpad: set and setting, beats as rough bullets, questions. A notes line that is only a quotation ("You look like your mother.") is pinned wording, which a draft must use verbatim.
- manuscript/NN-chapter/NN-scene.md: the scene's prose, and nothing else.
- .cyberkitty/: everything the app adds (sidecars holding marks and suggestions, chat, bible, summaries, alerts, change specs, hidden history snapshots). Nothing is ever written into the Markdown except words.
Scene ids look like manuscript/01-the-harbor/02-the-customs-shed.

THE SCREEN
- Left rail: the book title (New book, Open, Close); Direction (Summary, Theme, Tropes, Characters, Outline, Style); Book (Story bible, Timeline, Alerts with an open count, Maps and diagrams, History); Manuscript (chapters, each opening its chapter page, with scenes underneath showing "N to review", "N conflicts", "drafted", "notes only" or "empty"); New scene, New chapter; today's spend against the daily cap; Settings; a Chat toggle.
- Centre: the page in focus. Every editor is a live-preview Markdown editor like Obsidian: syntax fades until the cursor is on it, and clicking text just edits it.
- Right: the chat.
- Bottom of every page: the key, which lists every mark in one fixed order with its count on that page. Clicking a name steps through those marks.

MARKS
One vocabulary on every page, shown as faint shading so the page stays readable:
- unreviewed: Claude's words that are in the file but the author has not accepted yet. Faint blue, one shade per paragraph. Hovering shows small floating buttons: Accept (removes the shade), Other ways to say this sentence (the writer offers up to four alternatives in a small list; clicking one replaces the sentence), and a chat bubble (attaches the paragraph to the chat). If the author types inside the paragraph, it becomes theirs and the shade goes.
- updated: text the author had accepted that has since been changed by Claude (for example by a merged chapter change). Blue with a hairline. Hovering shows Accept, Other ways to say this sentence (the list starts with the version they had accepted, which puts it back) and the chat bubble.
- suggested: Claude's words that are not in the file yet. The words a suggestion would replace are struck through, and the proposed words follow, dashed and paler. A suggested addition appears as a dashed block after the line it follows. Hovering shows Accept (the words go into the file, unshaded), Other ways to say this in prose (the writer offers alternatives to the proposed words; picking one accepts it), the chat bubble (to talk it over before deciding) and Reject (the suggestion disappears, the file unchanged).
- conflict: faint orange on text that disagrees with something elsewhere in the book. Hovering opens the alert that explains it.
- tell: a quiet dotted grey underline on a phrase from the ban list or a known AI tell, in prose.
- gap: a dotted outline on a [bracketed] spot in prose that the author left to draft later.
No shade means the words are the author's or accepted.

PAGES
- Scene page: notes and prose side by side (or either alone). Above the notes, the scene summary kept by background Claude, with sentences that changed since the author last looked shaded updated. Draft it streams the writer's prose straight into the prose file: from the whole notes, from the notes the author has selected, or into a [gap] line under the cursor. Each drafted paragraph arrives unreviewed. If the draft left out pinned wording, the author is told.
- Selecting text in any editor shows a small toolbar: Comment (attaches the selection to the chat as a quoted passage). In prose it also offers Plainer, Shorter, Rougher, More concrete, Like my samples and Alternatives; those are writer rewrites, and each comes back as a suggestion over the selection.
- Direction pages and the style page: one editor each, with a hint line. The outline shows "N diverged" when the writing has left an outline entry behind; the style page shows a notice when a passage the author wrote is proposed as a style sample.
- Chapter page: the chapter intent on the left; on the right, scene cards (words, review and conflict counts, summary) and a "Change the chapter" box where the author describes a change and presses Propose a change.
- Change page: a chapter-scale change. Claude writes a change spec (goal, scene by scene, must not change, effects elsewhere); the author reads or edits it, then Approve and rewrite has the writer rewrite each scene against it into a working copy, never the file. Review shows paragraph diffs, old struck and new dashed, each with Accept or Keep mine, plus Accept all and Merge into the book. Paragraphs accepted one by one land unshaded; through Accept all, rewritten paragraphs land updated and new ones unreviewed. The whole merge is one undo. Effects the spec names outside the rewritten scenes become alerts.
- Story bible: entries from the text grouped by type (characters, events, movements, places, world rules and objects) and subject, each linking to the words that establish it. The author can correct an entry and the correction sticks. Claude's own ideas wait at the top, shaded unreviewed, with Keep and Dismiss. A second tab edits bible.md. The same entries are the Markdown files in bible/.
- Timeline: events in story order with story times, and each character's path from place to place. Clicking one jumps to its words.
- Alerts: a list in book order with Open, Done and Dismissed tabs. Each card shows its kind, a title, the explanation, the quoted words on each side side by side (clicking jumps there), a suggested fix, and Done, Ask Claude (sends the alert and its quotes to the chat) and Dismiss. A dismissed alert is never raised again for the same pair of quotes. An alert closes itself when its quoted words are no longer in the text. Also on this page: todos, "Scan the book now", Claude's bible ideas, outline divergence, scenes written before a direction page changed, and proposed style samples.
- Maps and diagrams: SVG diagrams drawn from the bible on request. History: snapshots with restore (a restore is itself undoable). Settings: API key, model and effort per role, the daily spending cap, pause lengths, ghost text, and how much the author wants Claude to volunteer.

THE CHAT
- One conversation for the whole book. Every author message carries their place: the page, the paragraph under the cursor and any selection, shown to the author as an "on <place>" chip. Passages the author attached (Comment, the chat bubble, Ask Claude) appear as quotes above their message.
- The planner's replies are rendered Markdown. Links of the form ck:scene/<id>?q=<quote>, ck:page/<name>?q=<quote>, ck:chapter/<id>, ck:alert/<id>, ck:change/<id> and ck:bible/<id> are clickable: they open the place and select the quoted words, and a link wears the mark of what it points at (a link to a suggestion looks dashed).
- Each tool the planner uses shows as a small grey line in the chat ("Claude suggested an edit in Arrival notes"). The author can stop a reply mid-way.

THE PLANNER'S TOOLS AND WHAT THE AUTHOR SEES
- read_doc: reads a document as it is now. Nothing visible.
- suggest_edit (notes, direction pages, the style page, bible.md, chapter intents): a suggestion over the quoted words, struck old and dashed new, with Accept, the chat bubble and Reject on hover. Not available on prose files.
- suggest_insert (same documents): a dashed block after the quoted line, or at the end of the document. Accept inserts it.
- rewrite_prose: the writer rewrites a quoted span of prose following the planner's brief; the result is a suggestion over that span.
- draft_prose: the writer drafts new prose from beats and a brief; it appears as a suggested block after the quoted paragraph, not straight in the file (unlike Draft it).
- add_bible_idea: an unreviewed entry under Claude's ideas in the bible, plus a card on the alerts page, until the author keeps or dismisses it.
- file_alert: a card on the alerts page. For continuity, timeline and direction alerts, both quoted passages are also shaded conflict in the text. An alert is not filed if a quote is not found word for word, or if the author dismissed the same pair before.
- add_todo: a todo card on the alerts page.
- propose_change_spec: opens a change page in draft, for the author to edit and approve.
- draw_diagram: adds a diagram to Maps and diagrams.
Suggestions wait in their document even when it is not open; the author sees them when they go there (a link in the chat takes them straight to it). When the author accepts, rejects or edits, the planner hears about it through the next message's list of documents that changed.

WHAT HAPPENS IN THE BACKGROUND
- When the author stops typing for a short while (30 seconds by default), the book is snapshotted and background Claude catches up: rewrites the summaries of scenes whose prose changed, updates the bible and timeline from the text (only facts it can quote), checks whether a chapter left its outline entry behind (an alert plus a suggestion on outline.md), and when a direction page has changed, rereads scenes written before the change and files an alert for any that no longer fit.
- When the author moves to another chapter, after a longer pause (10 minutes by default), or on "Scan the book now", background Claude reads the whole book and files alerts for real contradictions, each quoting both sides.
- Background work stops for the day at the author's spending cap.

WHAT THE WRITER'S OUTPUT BECOMES
- Draft it: streamed into the prose file at the cursor, a gap or the end; each paragraph unreviewed.
- Rewrite tools and planner briefs: a suggestion over the span, or a suggested block.
- Alternatives: a short list in a popup; the author's pick replaces the sentence.
- Chapter changes: the diff review described above.
- Ghost text (an optional setting): one grey sentence after the cursor while the author writes; Tab takes it, unreviewed; typing ignores it.
- When the author rewrites a paragraph Claude wrote, the before and after are logged and shown to the writer as corrections in later calls.
</cyberkitty_guide>`

/**
 * The guide as its own system block, cached for an hour. It is the same in
 * every call to every model, so it is always the first thing in the prefix.
 */
export const GUIDE_BLOCK = { type: 'text' as const, text: CYBERKITTY_BRIEFING, cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } }

/** System blocks for a one-off job: the guide, then that job's instructions. */
export function jobSystem(instructions: string): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '5m' | '1h' } }> {
  return [GUIDE_BLOCK, { type: 'text', text: instructions }]
}
