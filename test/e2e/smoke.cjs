// End-to-end smoke test: launches the built app on a copy of the sample book
// with a stand-in writer (no API key, no network), drafts a scene, accepts and
// edits marks, then edits the file from outside the app.
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
  const el = await _electron.launch({
    executablePath: require(path.join(app, 'node_modules/electron')),
    args: [app, '--no-sandbox', `--user-data-dir=${userData}`],
    env: { ...process.env, CYBERKITTY_BOOK: book, CYBERKITTY_FAKE_WRITER: '1' }
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

  assert.deepEqual(errors, [])
  await el.close()
  console.log(`e2e ok · screenshots in ${shots}`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
