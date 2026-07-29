import { useEffect, useRef, useState } from 'react'

export function useScrollActivity() {
  const [isActive, setIsActive] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    },
    [],
  )

  const handleScroll = () => {
    setIsActive(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setIsActive(false), 800)
  }

  return { isActive, handleScroll }
}
