// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOVER_TOOLTIP_DELAY_MS, HoverTooltip } from './HoverTooltip'

function stubFinePointer(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(hover: hover) and (pointer: fine)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

describe('HoverTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    stubFinePointer(true)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('delegates delayed fine-pointer hover to data-tooltip, including disabled buttons', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('hover-tooltip')) {
        return { width: 120, height: 30 } as DOMRect
      }
      return {
        left: 4,
        right: 44,
        top: 4,
        bottom: 34,
        width: 40,
        height: 30,
      } as DOMRect
    })
    render(<><HoverTooltip /><button disabled data-tooltip="当前不可用">操作</button></>)
    const button = screen.getByRole('button', { name: '操作' })

    fireEvent.pointerOver(button, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_TOOLTIP_DELAY_MS - 1))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent('当前不可用')
    expect(tooltip).toHaveStyle({ left: '8px', top: '42px', visibility: 'visible' })
    expect(tooltip).toHaveAttribute('data-placement', 'below')
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)

    fireEvent.pointerOut(button, { relatedTarget: document.body })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).not.toHaveAttribute('aria-describedby')
  })

  it('shows immediately for focus and dismisses on Escape, blur, scroll, and resize', () => {
    render(<><HoverTooltip /><button data-tooltip="键盘提示" aria-describedby="existing-help">操作</button></>)
    const button = screen.getByRole('button', { name: '操作' })

    fireEvent.focusIn(button)
    const tooltip = screen.getByRole('tooltip')
    expect(button.getAttribute('aria-describedby')?.split(' ')).toEqual(['existing-help', tooltip.id])

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).toHaveAttribute('aria-describedby', 'existing-help')

    fireEvent.focusIn(button)
    fireEvent.focusOut(button, { relatedTarget: document.body })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focusIn(button)
    fireEvent.scroll(window)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focusIn(button)
    fireEvent.resize(window)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('ignores hover without a fine pointer and ignores elements without data-tooltip', () => {
    stubFinePointer(false)
    render(
      <>
        <HoverTooltip />
        <button data-tooltip="仅键盘显示">带提示</button>
        <button title="原生标题">无结构化提示</button>
      </>,
    )
    const tooltipButton = screen.getByRole('button', { name: '带提示' })

    fireEvent.pointerOver(tooltipButton, { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(HOVER_TOOLTIP_DELAY_MS))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.focusIn(tooltipButton)
    expect(screen.getByRole('tooltip')).toHaveTextContent('仅键盘显示')
    fireEvent.focusOut(tooltipButton, { relatedTarget: document.body })

    fireEvent.pointerOver(screen.getByRole('button', { name: '无结构化提示' }), { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_TOOLTIP_DELAY_MS))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('ignores touch pointers on fine-pointer devices and only restores focus tooltips after keyboard input', () => {
    render(<><HoverTooltip /><button data-tooltip="键盘提示">操作</button></>)
    const button = screen.getByRole('button', { name: '操作' })

    fireEvent.pointerOver(button, { pointerType: 'touch' })
    act(() => vi.advanceTimersByTime(HOVER_TOOLTIP_DELAY_MS))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.pointerDown(button, { pointerType: 'touch' })
    fireEvent.focusIn(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Tab' })
    fireEvent.focusIn(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('键盘提示')
  })

  it('hides on click and refreshes or removes an active tooltip with its target', async () => {
    const view = render(<><HoverTooltip /><button data-tooltip="原提示">操作</button></>)
    const button = screen.getByRole('button', { name: '操作' })

    fireEvent.focusIn(button)
    expect(screen.getByRole('tooltip')).toHaveTextContent('原提示')
    fireEvent.click(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).not.toHaveAttribute('aria-describedby')

    fireEvent.focusIn(button)
    await act(async () => {
      view.rerender(<><HoverTooltip /><button data-tooltip="新提示">操作</button></>)
      await Promise.resolve()
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('新提示')

    await act(async () => {
      view.rerender(<HoverTooltip />)
      await Promise.resolve()
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).not.toHaveAttribute('aria-describedby')
  })

  it('does not show a delayed tooltip after its target disconnects', () => {
    render(<HoverTooltip />)
    const button = document.createElement('button')
    button.dataset.tooltip = '即将移除'
    button.textContent = '操作'
    document.body.append(button)

    fireEvent.pointerOver(button, { pointerType: 'mouse' })
    button.remove()
    act(() => vi.advanceTimersByTime(HOVER_TOOLTIP_DELAY_MS))

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(button).not.toHaveAttribute('aria-describedby')
  })

  it('clears a pending target whose tooltip becomes empty before the delay', async () => {
    render(<><HoverTooltip /><button data-tooltip="原提示">操作</button></>)
    const button = screen.getByRole('button', { name: '操作' })

    fireEvent.pointerOver(button, { pointerType: 'mouse' })
    await act(async () => {
      button.removeAttribute('data-tooltip')
      await Promise.resolve()
    })
    button.setAttribute('data-tooltip', '恢复提示')
    fireEvent.pointerOver(button, { pointerType: 'mouse' })
    act(() => vi.advanceTimersByTime(HOVER_TOOLTIP_DELAY_MS))

    expect(screen.getByRole('tooltip')).toHaveTextContent('恢复提示')
  })
})
