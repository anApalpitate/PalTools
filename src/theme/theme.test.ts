/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_ID,
  THEMES,
  parseThemePreference,
  serializeThemePreference,
} from './theme'

interface ThemeTokenBlock {
  [token: string]: string
}

function parseThemeBlocks(css: string): Map<string, ThemeTokenBlock> {
  const blocks = new Map<string, ThemeTokenBlock>()
  const pattern = /html\[data-theme="([^"]+)"\]\s*\{([\s\S]*?)\}/g
  for (const match of css.matchAll(pattern)) {
    const tokens: ThemeTokenBlock = {}
    for (const line of match[2].split('\n')) {
      const declaration = line.match(/^\s*(--[\w-]+):\s*([^;]+);\s*$/)
      if (declaration) {
        tokens[declaration[1]] = declaration[2].trim()
      }
    }
    blocks.set(match[1], tokens)
  }
  return blocks
}

function parseColor(value: string): [number, number, number] | null {
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    return [
      parseInt(hex[1].slice(0, 2), 16),
      parseInt(hex[1].slice(2, 4), 16),
      parseInt(hex[1].slice(4, 6), 16),
    ]
  }
  const rgb = value.match(/^(\d+)\s+(\d+)\s+(\d+)$/)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

function relativeLuminance(color: [number, number, number]): number {
  const channel = (value: number) => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return (
    0.2126 * channel(color[0]) +
    0.7152 * channel(color[1]) +
    0.0722 * channel(color[2])
  )
}

function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(parseColor(foreground)!)
  const bg = relativeLuminance(parseColor(background)!)
  const [lighter, darker] = fg >= bg ? [fg, bg] : [bg, fg]
  return (lighter + 0.05) / (darker + 0.05)
}

describe('theme preference', () => {
  it('keeps unique registered theme ids', () => {
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length)
  })

  it.each([
    '--theme-canvas',
    '--theme-canvas-rgb',
    '--theme-surface',
    '--theme-surface-rgb',
    '--theme-surface-raised',
    '--theme-surface-raised-rgb',
    '--theme-surface-soft',
    '--theme-text',
    '--theme-text-rgb',
    '--theme-text-secondary',
    '--theme-text-muted',
    '--theme-accent',
    '--theme-accent-text',
    '--theme-accent-rgb',
    '--theme-accent-strong',
    '--theme-accent-contrast',
    '--theme-element-text',
    '--theme-element-border-rgb',
    '--theme-element-surface-rgb',
    '--theme-work-text',
    '--theme-work-border-rgb',
    '--theme-work-surface-rgb',
    '--theme-recipe-border-rgb',
    '--theme-recipe-glow-rgb',
    '--theme-recipe-surface-rgb',
    '--theme-control-border',
    '--theme-border-rgb',
    '--theme-overlay-rgb',
    '--theme-shadow-rgb',
    '--theme-scrollbar-rgb',
    '--theme-grid-rgb',
    '--theme-page-glow-rgb',
    '--theme-page-glow-secondary-rgb',
  ])('defines %s for every registered theme', (token) => {
    const themeCss = readFileSync(
      new URL('../styles/theme.css', import.meta.url),
      'utf8',
    )

    expect(themeCss.split(`${token}:`)).toHaveLength(THEMES.length + 1)
  })

  it.each([
    ['--theme-text', '--theme-canvas', 4.5],
    ['--theme-text-secondary', '--theme-surface', 4.5],
    ['--theme-text-muted', '--theme-surface', 4.5],
    ['--theme-accent-text', '--theme-canvas', 4.5],
    ['--theme-element-text', '--theme-canvas', 4.5],
    ['--theme-work-text', '--theme-surface-raised', 4.5],
    ['--theme-accent-contrast', '--theme-accent', 4.5],
    ['--theme-control-border', '--theme-surface', 3],
  ])(
    'keeps %s vs %s accessible in every theme',
    (foregroundToken, backgroundToken, minimum) => {
      const themeCss = readFileSync(
        new URL('../styles/theme.css', import.meta.url),
        'utf8',
      )
      const blocks = parseThemeBlocks(themeCss)

      for (const theme of THEMES) {
        const tokens = blocks.get(theme.id)
        expect(tokens, theme.id).toBeDefined()
        const foreground = tokens?.[foregroundToken]
        const background = tokens?.[backgroundToken]
        expect(foreground, `${theme.id} ${foregroundToken}`).toBeDefined()
        expect(background, `${theme.id} ${backgroundToken}`).toBeDefined()
        expect(parseColor(foreground!), `${theme.id} ${foregroundToken}`).not.toBeNull()
        expect(parseColor(background!), `${theme.id} ${backgroundToken}`).not.toBeNull()
        expect(
          contrastRatio(foreground!, background!),
          `${theme.id} ${foregroundToken} on ${backgroundToken}`,
        ).toBeGreaterThanOrEqual(minimum)
      }
    },
  )

  it('serializes and restores a valid theme', () => {
    expect(parseThemePreference(serializeThemePreference('sky'))).toBe('sky')
  })

  it('falls back from the retired amber preference', () => {
    expect(
      parseThemePreference(
        JSON.stringify({ schemaVersion: 1, themeId: 'amber' }),
      ),
    ).toBe(DEFAULT_THEME_ID)
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
