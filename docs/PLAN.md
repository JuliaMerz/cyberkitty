# v2 build plan

Vertical slices, each usable on its own. The spec is the source of truth for behaviour; this file tracks order and status.

| # | Slice | Status |
|---|-------|--------|
| 1 | **Write one scene.** Electron shell, book folder, live-preview editor, notes beside prose, "Draft it" with the writer, unreviewed marks with hover Accept, the key, self-healing sidecar, external edits, key storage, settings, spend meter, hidden git history, CI and release workflow | Built |
| 2 | **Global chat and the planner.** One conversation that knows where the author is; the planner's agent loop with the book in cached context; replies link to passages; edits land as suggestions (dashed, paler); comments on selected text; chat bubble and Reject in the hover window | Built |
| 3 | **Wording pass.** Sentence alternatives on demand, comments to span rewrites, humanize tools, tell detector, corrections log, the full style page | Built (alternatives prepared up front are not built yet) |
| 4 | **Direction pages, outline and chapter page.** Summary, theme, tropes, characters and arcs, outline as nested scratch notes, chapter intent | Built |
| 5 | **Settling, bible and timeline.** Automatic bible entries with source quotes, summaries, outline divergence, rereading scenes after a direction change, planned entries and Claude's ideas, restore points from history | Built |
| 6 | **Consistency scan and alerts.** Whole-book scan on leaving a chapter, on idle and on demand; quotes verified; dismissals stick to the pair; todos; proposed style samples | Built |
| 7 | **Chapter change specs and change review.** Spec, approve, rewrite against a working copy, paragraph diffs with accept or keep per change, accept all lands as updated, one-step undo | Built |
| 8 | **Voice, diagrams, ghost text, import.** | Diagrams, ghost text (setting, off by default) and Markdown import built. Voice is not built yet |
| 9 | **Notes for scratch work.** A Notes section, notes woven in among chapters and scenes, moving them, turning a note into a scene and back; kept out of counts, the bible, summaries, the scan and the manuscript export; the planner can start one | Built |

## Not in v1 yet

- **Voice.** Talking a scene through with speech-to-text needs a local or hosted transcription model; it is the next piece after friends have tried v1.
- **Alternatives prepared ahead.** Alternatives come on request from the hover window or the selection toolbar; preparing them right after a draft (to cut waiting) is not built.
- **Style eval.** Model defaults are judgment calls until the style eval reports.
