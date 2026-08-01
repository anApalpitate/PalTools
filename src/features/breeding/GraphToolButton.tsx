import type { ReactNode } from 'react'

export type GraphToolIcon =
  | 'select'
  | 'pan'
  | 'search'
  | 'child'
  | 'merge'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'layout'
  | 'fit'
  | 'zoom-in'
  | 'zoom-out'

export function GraphToolButton({
  label,
  icon,
  active,
  danger = false,
  disabled = false,
  onClick,
}: {
  label: string
  icon: GraphToolIcon
  active?: boolean
  danger?: boolean
  disabled?: boolean
  onClick(): void
}) {
  return (
    <button
      type="button"
      className={[
        'graph-tool-button',
        active ? 'is-active' : '',
        danger ? 'is-danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      data-tooltip={label}
      disabled={disabled}
      onClick={onClick}
    >
      <GraphIcon name={icon} />
      <span className="sr-only">{label}</span>
    </button>
  )
}

function GraphIcon({ name }: { name: GraphToolIcon }) {
  let content: ReactNode
  switch (name) {
    case 'select':
      content = <path d="M5 3l6.8 15 2.1-5.2L19 10.7 5 3z" />
      break
    case 'pan':
      content = (
        <>
          <path d="M8 11V6a1.5 1.5 0 013 0v4-6a1.5 1.5 0 013 0v6-4a1.5 1.5 0 013 0v5-2a1.5 1.5 0 013 0v4c0 5-3 8-7 8h-1c-3 0-5-2-6-4l-2-4a1.7 1.7 0 013-1l2 2" />
        </>
      )
      break
    case 'search':
      content = (
        <>
          <circle cx="10" cy="10" r="5.5" />
          <path d="M14 14l5 5" />
        </>
      )
      break
    case 'child':
      content = (
        <>
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="12" cy="18" r="2.5" />
          <path d="M7.5 8l3.3 7.5M16.5 8l-3.3 7.5" />
        </>
      )
      break
    case 'merge':
      content = <path d="M5 4v3c0 3 2 5 5 5h9M5 20v-3c0-3 2-5 5-5M16 8l4 4-4 4" />
      break
    case 'delete':
      content = (
        <>
          <path d="M4 7h16M9 3h6l1 4M7 7l1 14h8l1-14M10 11v6M14 11v6" />
        </>
      )
      break
    case 'undo':
      content = <path d="M9 7L4 12l5 5M5 12h8a6 6 0 016 6" />
      break
    case 'redo':
      content = <path d="M15 7l5 5-5 5M19 12h-8a6 6 0 00-6 6" />
      break
    case 'layout':
      content = (
        <>
          <rect x="3" y="3" width="7" height="6" rx="1" />
          <rect x="14" y="3" width="7" height="6" rx="1" />
          <rect x="8.5" y="15" width="7" height="6" rx="1" />
          <path d="M6.5 9v3h11V9M12 12v3" />
        </>
      )
      break
    case 'fit':
      content = <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />
      break
    case 'zoom-in':
      content = (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="M14.5 14.5L20 20M7 10h6M10 7v6" />
        </>
      )
      break
    case 'zoom-out':
      content = (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="M14.5 14.5L20 20M7 10h6" />
        </>
      )
      break
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {content}
    </svg>
  )
}
