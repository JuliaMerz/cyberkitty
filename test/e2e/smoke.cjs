// End-to-end smoke test: launches the built app on a copy of the sample book
// with a stand-in Claude (no API key, no network) and walks through the v1:
// drafting and review, humanize tools, chat suggestions, the bible and
// timeline, alerts, direction pages, a chapter-scale change and its undo,
// history and diagrams.
//
//   npm run build && npm run e2e        (Linux CI: xvfb-run -a npm run e2e)
//
// Needs the `playwright` package; it is not a dependency of the app.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { _electron } = require('playwright')

/** Marks, not spans: one mark can render as several spans. */
async function countMarks(win, kind = 'unreviewed') {
  const ids = await win.locator(`.cm-content .ck-${kind}`).evaluateAll((els) => els.map((e) => e.dataset.markId))
  return new Set(ids).size
}

const app = path.resolve(__dirname, '../..')
const shots = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), 'ck-shots-'))

;(async () => {
  const book = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-book-'))
  fs.cpSync(path.join(app, 'resources/sample-book'), book, { recursive: true })
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-userdata-'))
  const exports = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-export-'))
  const el = await _electron.launch({
    executablePath: require(path.join(app, 'node_modules/electron')),
    args: [app, '--no-sandbox', `--user-data-dir=${userData}`],
    env: { ...process.env, CYBERKITTY_BOOK: book, CYBERKITTY_FAKE_WRITER: '1', CYBERKITTY_EXPORT_DIR: exports }
  })
  const win = await el.firstWindow()
  const errors = []
  win.on('pageerror', (e) => errors.push(e.message))
  await win.setViewportSize({ width: 1440, height: 900 })

  await win.waitForSelector('.ck-editor-notes')
  await win.screenshot({ path: path.join(shots, '1-notes.png') })

  // Draft the whole scene from its notes.
  await win.click('button:has-text("Draft it")')
  await win.waitForSelector('button:has-text("Draft it")', { timeout: 20000 })
  await win.waitForTimeout(600)
  const proseFile = path.join(book, 'manuscript/01-the-harbor/01-arrival.md')
  const drafted = fs.readFileSync(proseFile, 'utf8')
  assert.match(drafted, /^# Arrival\n\n/)
  assert.match(drafted, /You look like your mother/)
  const marks = await countMarks(win)
  assert.ok(marks > 3, `expected unreviewed paragraphs, got ${marks}`)
  assert.ok(await win.locator('.keybar').isVisible(), 'key is visible')
  await win.screenshot({ path: path.join(shots, '2-drafted.png') })

  // Hover shows the floating buttons; Accept clears one mark and moves nothing.
  const target = win.locator('.cm-content .ck-unreviewed').nth(1)
  const before = await win.locator('.cm-content .ck-unreviewed').nth(2).boundingBox()
  await target.hover()
  await win.waitForSelector('.ck-hover-btn.accept')
  await win.screenshot({ path: path.join(shots, '3-hover.png') })
  assert.equal(await win.locator('.ck-hover-btn.reject').count(), 0, 'no reject on text already in the file')
  await win.locator('.ck-hover-btn.accept').click()
  await win.waitForTimeout(300)
  assert.equal(await countMarks(win), marks - 1)
  const after = await win.locator('.cm-content .ck-unreviewed').nth(1).boundingBox()
  assert.equal(Math.round(after.y), Math.round(before.y), 'accepting does not move the page')

  // Typing inside a paragraph makes it the author's and reviewed.
  await win.locator('.cm-content .ck-unreviewed').first().click()
  await win.keyboard.press('End')
  await win.keyboard.type(' Hm.')
  await win.waitForTimeout(1200)
  assert.equal(await countMarks(win), marks - 2)
  const sidecar = JSON.parse(fs.readFileSync(path.join(book, '.cyberkitty/scenes/01-the-harbor/01-arrival.json'), 'utf8'))
  assert.equal(sidecar.marks.length, marks - 2)

  // An edit from another app is picked up, and the marks heal around it.
  const text = fs.readFileSync(proseFile, 'utf8')
  fs.writeFileSync(proseFile, text.replace('# Arrival\n\n', '# Arrival\n\nA line added in another editor.\n\n'))
  await win.waitForSelector('text=Picked up changes', { timeout: 5000 })
  assert.equal(await countMarks(win), marks - 2)
  await win.screenshot({ path: path.join(shots, '4-external.png') })

  // History has snapshots.
  assert.ok(fs.existsSync(path.join(book, '.cyberkitty/history.git/HEAD')))
  const notesFile = path.join(book, 'manuscript/01-the-harbor/01-arrival.notes.md')

  // Humanize: select a sentence, ask for it plainer; it arrives as a suggestion.
  const line = win.locator('.ck-editor-prose .cm-line', { hasText: 'A line added in another editor.' })
  await line.click()
  await win.keyboard.press('Home')
  await win.keyboard.press('Shift+End')
  await win.waitForSelector('.ck-seltools')
  await win.screenshot({ path: path.join(shots, '5-selection-tools.png') })
  await win.click('.ck-seltool:has-text("Plainer")')
  await win.waitForSelector('.ck-suggestion', { timeout: 10000 })
  await win.locator('.ck-editor-prose .ck-sug-replace').hover()
  await win.waitForSelector('.ck-hover-btn.reject')
  await win.screenshot({ path: path.join(shots, '6-suggestion.png') })
  // The design's order on a suggestion: accept, alternatives, chat, reject.
  const order = await win.locator('.ck-hover .ck-hover-btn').evaluateAll((els) => els.map((e) => [...e.classList].find((c) => c !== 'ck-hover-btn')))
  assert.deepEqual(order, ['accept', 'alt', 'chat', 'reject'], `suggestion hover buttons: ${order}`)
  // Picking an alternative to the proposed words accepts it.
  await win.locator('.ck-hover-btn.alt').click()
  await win.waitForSelector('.alt-option')
  await win.locator('.alt-option').first().click()
  await win.waitForTimeout(800)
  assert.match(fs.readFileSync(proseFile, 'utf8'), /A line added in another editor, plainly, again\./)
  assert.equal(await win.locator('.ck-editor-prose .ck-suggestion').count(), 0, 'the suggestion is gone once an alternative is picked')

  // Chat: from a beat in the notes, ask for a suggestion; it lands in the notes.
  await win.locator('.ck-editor-notes .cm-line', { hasText: 'He turns.' }).click()
  await win.fill('.chat-compose textarea', 'Can you suggest a beat after this one?')
  await win.keyboard.press('Enter')
  await win.waitForSelector('.ck-editor-notes .ck-suggestion', { timeout: 10000 })
  await win.waitForSelector('.chat-entry.claude .ck-link', { timeout: 10000 })
  await win.screenshot({ path: path.join(shots, '7-chat-suggestion.png') })
  assert.ok(!fs.readFileSync(notesFile, 'utf8').includes('gull'), 'a suggestion is not in the file')
  await win.locator('.ck-editor-notes .ck-suggestion').hover()
  await win.waitForSelector('.ck-hover-btn.accept')
  await win.locator('.ck-hover-btn.accept').click()
  await win.waitForTimeout(800)
  assert.match(fs.readFileSync(notesFile, 'utf8'), /- He turns\.\n- A gull lands on the rail/)

  // The bible and timeline fill in from the text.
  await win.click('.rail-row:has-text("Story bible")')
  await win.click('button:has-text("Update from the text")')
  await win.waitForSelector('.bible-entry', { timeout: 10000 })
  // The bible is plain Markdown too.
  const bibleFiles = fs.readdirSync(path.join(book, 'bible'))
  assert.ok(bibleFiles.length > 0, 'the bible has Markdown files')
  assert.match(fs.readFileSync(path.join(book, 'bible', bibleFiles[0]), 'utf8'), /^# .+\n\n## .+\n\n- /)
  await win.screenshot({ path: path.join(shots, '8-bible.png') })
  await win.click('.rail-row:has-text("Timeline")')
  await win.waitForSelector('.timeline-list li')

  // Alerts: a todo in book order.
  await win.click('.rail-row:has-text("Alerts")')
  await win.fill('.todo-add input', 'Plant the key in chapter 1')
  await win.click('.todo-add button')
  await win.waitForSelector('.alert-card:has-text("Plant the key")')
  await win.screenshot({ path: path.join(shots, '9-alerts.png') })
  await win.click('.alert-card:has-text("Plant the key") button:has-text("Done")')
  await win.waitForSelector('.alert-card:has-text("Plant the key")', { state: 'detached' })

  // A direction page is a plain Markdown file.
  await win.click('.rail-row:has-text("Characters")')
  await win.locator('.ck-editor-page .cm-content').click()
  await win.keyboard.press('Control+End')
  await win.keyboard.type('\n\n## Tomas\n\nKeeps the keys.')
  await win.waitForTimeout(900)
  assert.match(fs.readFileSync(path.join(book, 'characters.md'), 'utf8'), /## Tomas\n\nKeeps the keys\./)

  // A chapter-scale change: spec, rewrite, review, merge, undo.
  await win.click('.rail-chapter-title')
  await win.waitForSelector('.scene-card')
  await win.screenshot({ path: path.join(shots, '10-chapter.png') })
  const original = fs.readFileSync(proseFile, 'utf8')
  await win.fill('.chapter-side textarea', 'Make Tomas warmer.')
  await win.click('button:has-text("Propose a change")')
  await win.waitForSelector('button:has-text("Approve and rewrite")', { timeout: 10000 })
  await win.click('button:has-text("Approve and rewrite")')
  await win.waitForSelector('button:has-text("Merge into the book")', { timeout: 20000 })
  await win.screenshot({ path: path.join(shots, '11-change-review.png') })
  await win.click('button:has-text("Accept all")')
  await win.click('button:has-text("Merge into the book")')
  await win.waitForSelector('button:has-text("Undo the whole change")', { timeout: 10000 })
  assert.notEqual(fs.readFileSync(proseFile, 'utf8'), original, 'the merge changed the scene')
  // Through accept all: rewrites of the author's paragraphs land as updated, new paragraphs as unreviewed.
  const merged = JSON.parse(fs.readFileSync(path.join(book, '.cyberkitty/scenes/01-the-harbor/01-arrival.json'), 'utf8')).marks.filter((m) => m.origin.source === 'change')
  const gull = merged.find((m) => m.anchor.quote.includes('gull'))
  assert.equal(gull && gull.kind, 'unreviewed', 'a new paragraph lands as unreviewed')
  assert.ok(merged.some((m) => m.kind === 'updated' && m.acceptedText), 'a rewritten paragraph lands as updated with what it replaced')
  await win.click('button:has-text("Undo the whole change")')
  await win.waitForTimeout(800)
  assert.equal(fs.readFileSync(proseFile, 'utf8'), original, 'undo restored the scene')

  // History and diagrams.
  await win.click('.rail-row:has-text("History")')
  await win.waitForSelector('.history-list li')
  await win.click('.rail-row:has-text("Maps and diagrams")')
  await win.fill('.todo-add input', 'a map of the harbor')
  await win.click('button:has-text("Draw")')
  await win.waitForSelector('.diagram img')
  await win.screenshot({ path: path.join(shots, '12-diagrams.png') })

  // The File menu: a new scene in the current chapter, then closing the book.
  const menuClick = (label) =>
    el.evaluate(({ Menu }, label) => {
      const find = (items) => {
        for (const it of items) {
          if (it.label === label) return it
          const sub = it.submenu && find(it.submenu.items)
          if (sub) return sub
        }
        return null
      }
      find(Menu.getApplicationMenu().items).click()
    }, label)
  await win.click('.rail-chapter-title')
  await menuClick('New Scene…')
  await win.fill('.modal input', 'The Letter')
  await win.keyboard.press('Enter')
  await win.waitForSelector('.rail-row.current:has-text("The Letter")')
  assert.ok(fs.existsSync(path.join(book, 'manuscript/01-the-harbor/03-the-letter.notes.md')))
  await menuClick('New Chapter…')
  await win.fill('.modal input', 'The Island')
  await win.keyboard.press('Enter')
  await win.waitForSelector('.rail-chapter.current:has-text("The Island")')
  // Export: the manuscript, the notes and the bible, each as one Markdown file.
  await menuClick('Manuscript…')
  await menuClick('Notes and Planning…')
  await menuClick('Story Bible…')
  await win.waitForTimeout(800)
  const exported = fs.readdirSync(exports).sort()
  assert.equal(exported.length, 3, `three exports, got ${exported.join(', ')}`)
  const manuscript = fs.readFileSync(path.join(exports, exported.find((f) => f.endsWith('manuscript.md'))), 'utf8')
  assert.match(manuscript, /## The Harbor\n\n/)
  assert.ok(!manuscript.includes('- He turns.'), 'no notes in the manuscript')
  assert.match(fs.readFileSync(path.join(exports, exported.find((f) => f.endsWith('notes and planning.md'))), 'utf8'), /- A gull lands on the rail/)

  await win.click('.rail-book-actions button:has-text("Close")')
  await win.waitForSelector('.welcome-card button:has-text("New book")')

  // The event log saw each kind of thing the author did, in order.
  const log = fs.readFileSync(path.join(book, '.cyberkitty/log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).text)
  const expected = [
    'The author pressed Draft it',
    'The author asked the writer for a plainer version',
    'The writer suggested in the prose',
    'The author did not take a suggestion',
    'The author wrote in the chat',
    'The planner suggested in the notes',
    'The author accepted a suggestion in the notes',
    'New todo',
    'marked done by the author',
    'The author merged the chapter change',
    'The author undid the chapter change',
    'New document: the notes of “The Letter”'
  ]
  let at = -1
  for (const want of expected) {
    const i = log.findIndex((t, j) => j > at && t.includes(want))
    assert.ok(i > at, `event log is missing, or has out of order: ${want}`)
    at = i
  }

  assert.deepEqual(errors, [])
  await el.close()
  console.log(`e2e ok · screenshots in ${shots}`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
