import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LocalPalImage } from '../../components/pal-ui'
import type { PalRecord } from '../../domain/types'

type AvatarSize = 'card' | 'detail' | 'formula' | 'tree' | 'mini'

interface AvatarBaseProps {
  pal: PalRecord
  size?: AvatarSize
}

interface InteractiveAvatarProps extends AvatarBaseProps {
  mode: 'interactive'
  selected: boolean
  onActivate: () => void
}

interface PreviewAvatarProps extends AvatarBaseProps {
  mode: 'previewOnly'
}

export type BreedingPalAvatarProps = InteractiveAvatarProps | PreviewAvatarProps

interface TooltipPosition {
  left: number
  top: number
  placement: 'above' | 'below'
}

const TOOLTIP_GAP = 8
const VIEWPORT_MARGIN = 8

export function BreedingPalAvatar(props: BreedingPalAvatarProps) {
  const { pal, size = 'mini', mode } = props
  const tooltipId = useId()
  const anchorRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLSpanElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>({
    left: VIEWPORT_MARGIN,
    top: VIEWPORT_MARGIN,
    placement: 'above',
  })
  const visible = hovered || focused
  const identityText = `${pal.paldexNo ? `#${pal.paldexNo}` : pal.internalId} · ${pal.name.zhHans}`
  const tooltipText = mode === 'interactive'
    ? `${identityText} · ${props.selected ? '再次点击查看图鉴' : '点击选中'}`
    : identityText

  const readAnchorRect = () => {
    const element = anchorRef.current
    if (element) setAnchorRect(element.getBoundingClientRect())
  }

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current
    if (!visible || !anchorRect || !tooltip) return

    const tooltipRect = tooltip.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const maxLeft = Math.max(
      VIEWPORT_MARGIN,
      viewportWidth - tooltipRect.width - VIEWPORT_MARGIN,
    )
    const centeredLeft = anchorRect.left + (anchorRect.width - tooltipRect.width) / 2
    const left = Math.min(Math.max(centeredLeft, VIEWPORT_MARGIN), maxLeft)
    const aboveTop = anchorRect.top - tooltipRect.height - TOOLTIP_GAP
    const placement = aboveTop >= VIEWPORT_MARGIN ? 'above' : 'below'
    const preferredTop = placement === 'above'
      ? aboveTop
      : anchorRect.bottom + TOOLTIP_GAP
    const maxTop = Math.max(
      VIEWPORT_MARGIN,
      viewportHeight - tooltipRect.height - VIEWPORT_MARGIN,
    )
    const top = Math.min(Math.max(preferredTop, VIEWPORT_MARGIN), maxTop)

    setTooltipPosition((current) =>
      current.left === left && current.top === top && current.placement === placement
        ? current
        : { left, top, placement },
    )
  }, [anchorRect, tooltipText, visible])

  useEffect(() => {
    if (!visible) return

    const updatePosition = () => readAnchorRect()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [visible])

  const sharedProps = {
    onPointerEnter: () => {
      setHovered(true)
      readAnchorRect()
    },
    onPointerLeave: () => setHovered(false),
  }
  const image = <LocalPalImage pal={pal} size={size} />
  const avatar = mode === 'interactive' ? (
    <button
      {...sharedProps}
      ref={anchorRef as React.RefObject<HTMLButtonElement>}
      type="button"
      className={`breeding-pal-avatar breeding-pal-avatar--interactive ${props.selected ? 'is-selected' : ''}`}
      aria-describedby={tooltipId}
      aria-label={props.selected
        ? `${identityText}，已选中，再次激活前往图鉴`
        : `${identityText}，选择帕鲁`}
      aria-pressed={props.selected}
      onClick={props.onActivate}
      onFocus={() => {
        setFocused(true)
        readAnchorRect()
      }}
      onBlur={() => setFocused(false)}
    >
      {image}
    </button>
  ) : (
    <span
      {...sharedProps}
      ref={anchorRef as React.RefObject<HTMLSpanElement>}
      className="breeding-pal-avatar breeding-pal-avatar--preview"
    >
      {image}
    </span>
  )

  return (
    <>
      {avatar}
      {visible && typeof document !== 'undefined' && createPortal(
        <span
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="breeding-pal-avatar-tooltip"
          data-placement={tooltipPosition.placement}
          style={{
            position: 'fixed',
            left: tooltipPosition.left,
            top: tooltipPosition.top,
          }}
        >
          {tooltipText}
        </span>,
        document.body,
      )}
    </>
  )
}
