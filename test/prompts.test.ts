import { describe, expect, it } from 'vitest'
import { buildWriterPrompt } from '@shared/prompts'

const base = {
  bookTitle: 'The Late Ferry',
  styleMd: '# Style\n\nShort sentences.',
  chapterSoFar: [],
  sceneTitle: 'Arrival',
  notes: '- Mara steps off.\n- "You look like your mother."',
  proseBefore: '# Arrival\n\n',
  proseAfter: '',
  pinned: ['You look like your mother.']
}

describe('writer prompt', () => {
  it('caches the style page as the last system block', () => {
    const p = buildWriterPrompt(base)
    expect(p.system.at(-1)?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(p.system.at(-1)?.text).toContain('Short sentences.')
  })

  it('drafts the whole scene when there is no prose yet', () => {
    const p = buildWriterPrompt(base)
    const u = p.user.at(-1)?.text ?? ''
    expect(u).toContain('Draft the scene from its notes.')
    expect(u).not.toContain('<scene_prose>')
    expect(u).toContain('- You look like your mother.')
  })

  it('marks the insertion point when continuing prose', () => {
    const p = buildWriterPrompt({ ...base, proseBefore: '# Arrival\n\nThe ferry was late.\n\n', proseAfter: 'At the shed.', beats: '- He turns.' })
    const u = p.user.at(-1)?.text ?? ''
    expect(u).toMatch(/The ferry was late\.\n<<< WRITE HERE >>>\nAt the shed\./)
    expect(u).toContain('Draft only these beats')
    expect(u).not.toContain('# Arrival\n')
  })

  it('says so when the style page is empty', () => {
    const p = buildWriterPrompt({ ...base, styleMd: null })
    expect(p.system.at(-1)?.text).toContain('has not given samples or a description')
  })
})

describe('shared briefing', () => {
  it('opens the writer system prompt and every job prompt', async () => {
    const { CYBERKITTY_BRIEFING, jobSystem } = await import('@shared/briefing')
    const { writerSystem } = await import('@shared/prompts')
    expect(writerSystem('x')[0].text).toBe(CYBERKITTY_BRIEFING)
    expect(jobSystem('Do the job.').map((b) => b.text)).toEqual([CYBERKITTY_BRIEFING, 'Do the job.'])
  })
})

describe('writer context', () => {
  it('puts the frozen book after the style page, and the history in the request before the task', async () => {
    const { writerSystem, buildWriterPrompt } = await import('@shared/prompts')
    const sys = writerSystem('style', '<book_snapshot/>')
    expect(sys).toHaveLength(4)
    expect(sys[2].text).toContain('style')
    expect(sys[3]).toEqual({ type: 'text', text: '<book_snapshot/>', cache_control: { type: 'ephemeral', ttl: '1h' } })
    const p = buildWriterPrompt({ ...base, corrections: [{ before: 'She felt sad.', after: 'She sat.' }], bookContext: { snapshot: '<book_snapshot/>', history: ['<events>x</events>'] } })
    expect(p.user[0]).toEqual({ type: 'text', text: '<events>x</events>', cache_control: { type: 'ephemeral', ttl: '1h' } })
    expect(p.user[1].text).toContain('<corrections>')
    expect(p.user[1].text).toContain('Draft the scene from its notes.')
  })
})
