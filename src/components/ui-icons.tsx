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

export function ArrowRightIcon() {
  return <UiIcon><path d="M5 12h14" /><path d="m14 7 5 5-5 5" /></UiIcon>
}

export function PanelOpenIcon() {
  return <UiIcon><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /><path d="m5.5 9 2.5 3-2.5 3" /></UiIcon>
}

export function PanelCloseIcon() {
  return <UiIcon><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M9 4.5v15" /><path d="m7.5 9-2.5 3 2.5 3" /></UiIcon>
}
