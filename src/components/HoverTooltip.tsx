import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const TOOLTIP_SELECTOR = '[data-tooltip]'
const TOOLTIP_GAP = 8
const VIEWPORT_MARGIN = 8
const TOUCH_FOCUS_SUPPRESSION_MS = 1_000

export const HOVER_TOOLTIP_DELAY_MS = 360

interface ActiveTooltip {
  target: HTMLElement
  text: string
  trigger: 'focus' | 'hover'
}

interface TooltipPosition {
  left: number
  top: number
  placement: 'above' | 'below'
}

function tooltipTarget(value: EventTarget | null) {
  if (!(value instanceof Element)) return null
  const target = value.closest<HTMLElement>(TOOLTIP_SELECTOR)
  return target?.dataset.tooltip?.trim() ? target : null
}

function hasFinePointer() {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

export function HoverTooltip() {
  const tooltipId = useId()
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const activeRef = useRef<ActiveTooltip | null>(null)
  const pendingTargetRef = useRef<HTMLElement | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const lastTouchPointerAtRef = useRef<number | null>(null)
  const [active, setActive] = useState<ActiveTooltip | null>(null)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  useEffect(() => {
    const clearPending = () => {
      if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
      pendingTargetRef.current = null
    }
    const hide = () => {
      clearPending()
      activeRef.current = null
      setActive(null)
      setPosition(null)
    }
    const refreshTargets = () => {
      const pending = pendingTargetRef.current
      if (pending && (!pending.isConnected || !pending.dataset.tooltip?.trim())) clearPending()
      const current = activeRef.current
      if (!current) return
      if (!current.target.isConnected) {
        hide()
        return
      }
      const text = current.target.dataset.tooltip?.trim()
      if (!text) {
        hide()
        return
      }
      if (text !== current.text) {
        const next = { ...current, text }
        activeRef.current = next
        setPosition(null)
        setActive(next)
      }
    }
    const show = (target: HTMLElement, trigger: ActiveTooltip['trigger']) => {
      clearPending()
      if (!target.isConnected) return
      const text = target.dataset.tooltip?.trim()
      if (!text) return
      const next = { target, text, trigger }
      activeRef.current = next
      setPosition(null)
      setActive(next)
    }
    const scheduleHover = (target: HTMLElement) => {
      if (pendingTargetRef.current === target) return
      clearPending()
      pendingTargetRef.current = target
      hoverTimerRef.current = window.setTimeout(() => {
        if (pendingTargetRef.current === target) show(target, 'hover')
      }, HOVER_TOOLTIP_DELAY_MS)
    }
    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        hide()
        return
      }
      if (!hasFinePointer()) return
      const target = tooltipTarget(event.target)
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return
      if (activeRef.current?.target === target) return
      if (activeRef.current?.trigger === 'hover') {
        activeRef.current = null
        setActive(null)
        setPosition(null)
      }
      scheduleHover(target)
    }
    const handlePointerOut = (event: PointerEvent) => {
      const target = tooltipTarget(event.target)
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return
      if (pendingTargetRef.current === target) clearPending()
      if (activeRef.current?.target === target && activeRef.current.trigger === 'hover') hide()
    }
    const handlePointerDown = (event: PointerEvent) => {
      lastTouchPointerAtRef.current = event.pointerType === 'touch' ? Date.now() : null
      if (event.pointerType === 'touch') hide()
    }
    const handleFocusIn = (event: FocusEvent) => {
      const target = tooltipTarget(event.target)
      if (!target) return
      const lastTouchPointerAt = lastTouchPointerAtRef.current
      if (lastTouchPointerAt !== null && Date.now() - lastTouchPointerAt < TOUCH_FOCUS_SUPPRESSION_MS) {
        hide()
        return
      }
      show(target, 'focus')
    }
    const handleFocusOut = (event: FocusEvent) => {
      const target = tooltipTarget(event.target)
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return
      if (activeRef.current?.target === target && activeRef.current.trigger === 'focus') hide()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      lastTouchPointerAtRef.current = null
      if (event.key === 'Escape') hide()
    }
    const handleClick = () => hide()
    const observer = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(refreshTargets)

    document.addEventListener('pointerover', handlePointerOver, true)
    document.addEventListener('pointerout', handlePointerOut, true)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('focusin', handleFocusIn, true)
    document.addEventListener('focusout', handleFocusOut, true)
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('click', handleClick, true)
    window.addEventListener('resize', hide)
    window.addEventListener('scroll', hide, true)
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tooltip'],
      childList: true,
      subtree: true,
    })
    return () => {
      clearPending()
      observer?.disconnect()
      document.removeEventListener('pointerover', handlePointerOver, true)
      document.removeEventListener('pointerout', handlePointerOut, true)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('focusin', handleFocusIn, true)
      document.removeEventListener('focusout', handleFocusOut, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('click', handleClick, true)
      window.removeEventListener('resize', hide)
      window.removeEventListener('scroll', hide, true)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const describedBy = active.target.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []
    if (!describedBy.includes(tooltipId)) {
      active.target.setAttribute('aria-describedby', [...describedBy, tooltipId].join(' '))
    }
    return () => {
      const current = active.target.getAttribute('aria-describedby')?.split(/\s+/).filter(Boolean) ?? []
      const remaining = current.filter((id) => id !== tooltipId)
      if (remaining.length) active.target.setAttribute('aria-describedby', remaining.join(' '))
      else active.target.removeAttribute('aria-describedby')
    }
  }, [active, tooltipId])

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!active || !tooltip) return
    const anchorRect = active.target.getBoundingClientRect()
    const tooltipRect = tooltip.getBoundingClientRect()
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN)
    const centeredLeft = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft)
    const aboveTop = anchorRect.top - tooltipRect.height - TOOLTIP_GAP
    const belowTop = anchorRect.bottom + TOOLTIP_GAP
    const placement = aboveTop >= VIEWPORT_MARGIN ? 'above' : 'below'
    const preferredTop = placement === 'above' ? aboveTop : belowTop
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN)
    const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop)
    setPosition({ left, top, placement })
  }, [active])

  if (!active || typeof document === 'undefined') return null
  return createPortal(
    <span
      ref={tooltipRef}
      id={tooltipId}
      role="tooltip"
      className="hover-tooltip"
      data-placement={position?.placement}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {active.text}
    </span>,
    document.body,
  )
}
