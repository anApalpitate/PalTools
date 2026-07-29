// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

afterEach(cleanup)

function renderSettings(overrides: Partial<Parameters<typeof SettingsPage>[0]> = {}) {
  const props: Parameters<typeof SettingsPage>[0] = {
    themeId: 'forest',
    onThemeChange: vi.fn(),
    appConfig: {
      schemaVersion: 1,
      pathPlanner: { maxExactGeneration: 6 },
    },
    configDraft: '6',
    configRecovered: false,
    onConfigDraftChange: vi.fn(),
    onSaveConfig: vi.fn(),
    onResetConfig: vi.fn(),
    ...overrides,
  }
  render(<SettingsPage {...props} />)
  return props
}

describe('SettingsPage', () => {
  it('renders all registered themes with an accessible selected state', () => {
    renderSettings()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByRole('radio', { name: /森林夜色/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('reports theme and advanced setting changes through explicit callbacks', () => {
    const props = renderSettings()
    fireEvent.click(screen.getByRole('radio', { name: /琥珀橙/ }))
    fireEvent.change(screen.getByLabelText('指定代数上限'), {
      target: { value: '8' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }))

    expect(props.onThemeChange).toHaveBeenCalledWith('amber')
    expect(props.onConfigDraftChange).toHaveBeenCalledWith('8')
    expect(props.onSaveConfig).toHaveBeenCalledOnce()
  })

  it('supports arrow-key selection in the theme radio group', () => {
    const props = renderSettings()
    const forest = screen.getByRole('radio', { name: /森林夜色/ })
    forest.focus()
    fireEvent.keyDown(forest, { key: 'ArrowRight' })

    expect(props.onThemeChange).toHaveBeenCalledWith('pearl')
  })
})
