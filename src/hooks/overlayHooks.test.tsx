// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useBodyScrollLock } from './useBodyScrollLock'
import { useFocusTrap } from './useFocusTrap'

afterEach(() => {
  cleanup()
  document.body.style.overflow = ''
})

function ScrollLock() {
  useBodyScrollLock()
  return null
}

function FocusTrap({
  name,
  onEscape,
}: {
  name: string
  onEscape: () => void
}) {
  const containerRef = useRef<HTMLElement>(null)
  const firstRef = useRef<HTMLButtonElement>(null)
  useFocusTrap(containerRef, { initialFocusRef: firstRef, onEscape })
  return (
    <section ref={containerRef} aria-label={name}>
      <button ref={firstRef}>{name} 开始</button>
      <button>{name} 结束</button>
    </section>
  )
}

describe('overlay hooks', () => {
  it('keeps the original body overflow locked until the last owner unmounts', () => {
    document.body.style.overflow = 'clip'
    const { rerender, unmount } = render(
      <>
        <ScrollLock />
        <ScrollLock />
      </>,
    )

    expect(document.body.style.overflow).toBe('hidden')
    rerender(<ScrollLock />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('clip')
  })

  it('cycles focus and lets only the topmost trap handle Escape', async () => {
    const user = userEvent.setup()
    const outerEscape = vi.fn()
    const innerEscape = vi.fn()
    render(
      <>
        <FocusTrap name="外层" onEscape={outerEscape} />
        <FocusTrap name="内层" onEscape={innerEscape} />
      </>,
    )

    const innerStart = screen.getByRole('button', { name: '内层 开始' })
    const innerEnd = screen.getByRole('button', { name: '内层 结束' })
    expect(innerStart).toHaveFocus()
    innerEnd.focus()
    await user.tab()
    expect(innerStart).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(innerEscape).toHaveBeenCalledOnce()
    expect(outerEscape).not.toHaveBeenCalled()
  })
})
