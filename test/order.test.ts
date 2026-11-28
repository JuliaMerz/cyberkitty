import { describe, expect, it } from 'vitest'
import { keyBetween } from '@shared/order'

describe('names that sort a note into its place', () => {
  it('goes after what it follows and before what comes next', () => {
    expect(keyBetween('02-arrival', '03-customs')).toBe('02n')
    expect(keyBetween(null, '01-arrival')).toBe('00n')
    expect(keyBetween('03-customs', null)).toBe('03n')
    expect(keyBetween('02-arrival', '02n-shed')).toBe('02h')
    expect(keyBetween('02n-shed', '03-customs')).toBe('02u')
    expect(keyBetween(null, '00n-first')).toBe('00h')
  })

  it('always finds room, however many notes go in one place', () => {
    const names = ['02-arrival', '03-customs']
    for (let i = 0; i < 40; i++) {
      // Always insert straight after the scene, the tightest spot.
      const key = keyBetween(names[0], names[1])
      const name = `${key}-note-${i}`
      expect(name > names[0] && name < names[1]).toBe(true)
      names.splice(1, 0, name)
    }
    expect([...names].sort()).toEqual(names)
  })
})
