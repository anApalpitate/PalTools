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
    ...overrides,
  }
  render(<SettingsPage {...props} />)
  return props
}

describe('SettingsPage', () => {
  it('renders all registered themes with an accessible selected state', () => {
    renderSettings()
    expect(screen.getAllByRole('radio')).toHaveLength(8)
    expect(screen.getByRole('radio', { name: /森林夜色/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: /薰衣草霓虹/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /珊瑚莓果/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /深海薄荷/ })).toBeInTheDocument()
  })

  it('reports theme changes without rendering the retired generation setting', () => {
    const props = renderSettings()
    fireEvent.click(screen.getByRole('radio', { name: /琥珀橙/ }))

    expect(props.onThemeChange).toHaveBeenCalledWith('amber')
    expect(screen.queryByLabelText('指定代数上限')).not.toBeInTheDocument()
  })

  it('supports arrow-key selection in the theme radio group', () => {
    const props = renderSettings()
    const forest = screen.getByRole('radio', { name: /森林夜色/ })
    forest.focus()
    fireEvent.keyDown(forest, { key: 'ArrowRight' })

    expect(props.onThemeChange).toHaveBeenCalledWith('pearl')
  })
})
