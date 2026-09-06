import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styleEntry = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const baseStyles = readFileSync(new URL('./base.css', import.meta.url), 'utf8')
const assistantStyles = readFileSync(new URL('./assistant.css', import.meta.url), 'utf8')
const themeOverrides = readFileSync(new URL('./theme-overrides.css', import.meta.url), 'utf8')

function ruleBody(source: string, selectorFragment: string) {
  const selectorStart = source.indexOf(selectorFragment)
  expect(selectorStart).toBeGreaterThanOrEqual(0)
  const blockStart = source.indexOf('{', selectorStart)
  const blockEnd = source.indexOf('}', blockStart)
  return source.slice(blockStart + 1, blockEnd)
}

describe('button interaction styles', () => {
  it('loads theme-aware interaction overrides after every feature stylesheet', () => {
    const overrideImport = styleEntry.indexOf('@import "./styles/theme-overrides.css" layer(utilities);')
    expect(overrideImport).toBeGreaterThan(styleEntry.indexOf('@import "./styles/assistant.css" layer(features);'))
  })

  it.each([
    'html[data-theme] .primary-button:hover:not(:disabled)',
    'html[data-theme] .danger-button:hover:not(:disabled)',
    'html[data-theme] .reset-filter-button:hover:not(:disabled)',
    'html[data-theme] .dialog-close:hover:not(:disabled)',
    'html[data-theme] .pal-card:hover',
    'html[data-theme] .theme-option:hover',
  ])('%s changes border and surface without moving the control', (selector) => {
    const body = ruleBody(themeOverrides, selector)
    expect(body).toMatch(/border-color:/)
    expect(body).toMatch(/background(?:-color)?:/)
    expect(body).not.toMatch(/transform:/)
  })

  it('keeps the neutral hover treatment in the final utility layer', () => {
    const body = ruleBody(themeOverrides, 'html[data-theme] :where(\n    .quiet-button')
    expect(body).toMatch(/border-color:/)
    expect(body).toMatch(/background:/)
    expect(body).not.toMatch(/transform:/)
  })

  it('excludes disabled controls and lets selected theme options keep their state styling', () => {
    expect(baseStyles).toContain('button:not(:disabled):hover')
    expect(themeOverrides).toContain('):hover:not(:disabled)')
    expect(themeOverrides).toContain('.danger-button:hover:not(:disabled)')
    expect(themeOverrides.indexOf('html[data-theme] .theme-option.is-active')).toBeGreaterThan(
      themeOverrides.indexOf('html[data-theme] .theme-option:hover'),
    )
  })

  it('keeps disabled regenerate actions visually disabled and out of hover styling', () => {
    expect(assistantStyles).toContain('.assistant-regenerate:hover:not(:disabled)')
    const disabledBody = ruleBody(assistantStyles, '.assistant-send:disabled,\n.assistant-regenerate:disabled')
    expect(disabledBody).toContain('opacity: 0.42')
    expect(disabledBody).toContain('cursor: not-allowed')
  })
})
