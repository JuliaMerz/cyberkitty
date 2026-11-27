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
    expect(p.system.at(-1)?.cache_control).toEqual({ type: 'ephemeral' })
    expect(p.system.at(-1)?.text).toContain('Short sentences.')
  })

  it('drafts the whole scene when there is no prose yet', () => {
    const p = buildWriterPrompt(base)
    expect(p.user).toContain('Draft the scene from its notes.')
    expect(p.user).not.toContain('<scene_prose>')
    expect(p.user).toContain('- You look like your mother.')
  })

  it('marks the insertion point when continuing prose', () => {
    const p = buildWriterPrompt({ ...base, proseBefore: '# Arrival\n\nThe ferry was late.\n\n', proseAfter: 'At the shed.', beats: '- He turns.' })
    expect(p.user).toMatch(/The ferry was late\.\n<<< WRITE HERE >>>\nAt the shed\./)
    expect(p.user).toContain('Draft only these beats')
    expect(p.user).not.toContain('# Arrival\n')
  })

  it('says so when the style page is empty', () => {
    const p = buildWriterPrompt({ ...base, styleMd: null })
    expect(p.system.at(-1)?.text).toContain('has not filled in the style page')
  })
})

describe('shared briefing', () => {
  it('opens the writer system prompt and every job prompt', async () => {
    const { CYBERKITTY_BRIEFING, jobSystem } = await import('@shared/briefing')
    const { writerSystem } = await import('@shared/prompts')
    expect(writerSystem('x')[0].text.startsWith(CYBERKITTY_BRIEFING)).toBe(true)
    expect(jobSystem('Do the job.')[0].text).toBe(`${CYBERKITTY_BRIEFING}\n\nDo the job.`)
  })
})
