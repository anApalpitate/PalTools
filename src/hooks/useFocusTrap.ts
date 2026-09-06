import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

const activeTraps: symbol[] = []

interface FocusTrapOptions {
  active?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  returnFocusRef?: RefObject<HTMLElement | null>
  onEscape?: () => void
}

function focusableElements(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.closest('[hidden], [inert]'),
  )
}

export function useFocusTrap<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  {
    active = true,
    initialFocusRef,
    returnFocusRef,
    onEscape,
  }: FocusTrapOptions = {},
) {
  const trapIdRef = useRef(Symbol('focus-trap'))
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!active) return

    const trapId = trapIdRef.current
    const previouslyFocused = document.activeElement as HTMLElement | null
    activeTraps.push(trapId)

    const container = containerRef.current
    const initialFocus = initialFocusRef?.current ?? (
      container ? focusableElements(container)[0] : null
    )
    initialFocus?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeTraps.at(-1) !== trapId) return

      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab' || !containerRef.current) return

      const focusable = focusableElements(containerRef.current)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const focused = document.activeElement

      if (!containerRef.current.contains(focused)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && focused === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const trapIndex = activeTraps.lastIndexOf(trapId)
      if (trapIndex >= 0) activeTraps.splice(trapIndex, 1)
      const returnFocus = returnFocusRef?.current ?? previouslyFocused
      if (returnFocus?.isConnected) returnFocus.focus()
    }
  }, [active, containerRef, initialFocusRef, returnFocusRef])
}
