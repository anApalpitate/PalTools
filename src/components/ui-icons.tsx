import type { ReactNode } from 'react'

function UiIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function ResetIcon() {
  return <UiIcon><path d="M19 7v5h-5" /><path d="M18 12a7 7 0 1 0-1.4 4.2" /></UiIcon>
}

export function CloseIcon() {
  return <UiIcon><path d="m7 7 10 10" /><path d="M17 7 7 17" /></UiIcon>
}

export function ExternalLinkIcon() {
  return <UiIcon><path d="M14 5h5v5" /><path d="m12 12 7-7" /><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></UiIcon>
}

export function BreedingRouteIcon() {
  return (
    <UiIcon>
      <circle cx="5" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 6h1.5c2.5 0 2.5 6 5 6H17" />
      <path d="M7 18h1.5c2.5 0 2.5-6 5-6" />
    </UiIcon>
  )
}

export function PaldexIcon() {
  return (
    <UiIcon>
      <path d="M5 4.75h10.5A2.5 2.5 0 0 1 18 7.25V19H7.5A2.5 2.5 0 0 0 5 21.5z" />
      <path d="M5 4.75v16.5M9 8h5M9 11.5h4" />
    </UiIcon>
  )
}

export function SettingsIcon() {
  return (
    <UiIcon>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </UiIcon>
  )
}

export function ArrowRightIcon() {
  return <UiIcon><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></UiIcon>
}

export function PanelOpenIcon() {
  return <UiIcon><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /><path d="m5.5 9 2.5 3-2.5 3" /></UiIcon>
}

export function PanelCloseIcon() {
  return <UiIcon><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /><path d="m7.5 9-2.5 3 2.5 3" /></UiIcon>
}

export function SelectAllIcon({ selected = false }: { selected?: boolean }) {
  return (
    <UiIcon>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      {selected ? <path d="m8 12 2.5 2.5L16.5 9" /> : <path d="M8 9h8M8 12h8M8 15h5" />}
    </UiIcon>
  )
}

export function PendingPlanIcon() {
  return (
    <UiIcon>
      <path d="M8 5.5H6.5A1.5 1.5 0 0 0 5 7v11a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18V7a1.5 1.5 0 0 0-1.5-1.5H16" />
      <path d="M9 4h6v3H9zM9 11h6M9 15h3" />
    </UiIcon>
  )
}

export function ExcludeSelfIcon() {
  return (
    <UiIcon>
      <path d="M18 12a6 6 0 0 0-10.8-3.6L5 11" />
      <path d="M5 6v5h5M6 18 18 6" />
    </UiIcon>
  )
}

export function SortKeyIcon() {
  return (
    <UiIcon>
      <path d="M8 6h11M8 12h8M8 18h5" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </UiIcon>
  )
}

export function SortDirectionIcon({ direction }: { direction: 'asc' | 'desc' }) {
  return (
    <UiIcon>
      <path d={direction === 'desc' ? 'M8 5v14m0 0-3-3m3 3 3-3' : 'M8 19V5m0 0L5 8m3-3 3 3'} />
      <path d="M14 7h5M14 12h4M14 17h3" />
    </UiIcon>
  )
}
