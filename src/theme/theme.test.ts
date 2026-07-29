import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ID,
  THEMES,
  parseThemePreference,
  serializeThemePreference,
} from './theme'

describe('theme preference', () => {
  it('keeps unique registered theme ids', () => {
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length)
  })

  it('serializes and restores a valid theme', () => {
    expect(parseThemePreference(serializeThemePreference('sky'))).toBe('sky')
  })

  it.each([
    null,
    '',
    '{',
    JSON.stringify({ schemaVersion: 2, themeId: 'sky' }),
    JSON.stringify({ schemaVersion: 1, themeId: 'removed-theme' }),
  ])('falls back for missing or invalid preference: %s', (raw) => {
    expect(parseThemePreference(raw)).toBe(DEFAULT_THEME_ID)
  })
})
