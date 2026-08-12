// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PalRecord } from '../../domain/types'
import { BreedingPalAvatar } from './BreedingPalAvatar'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function makePal(paldexNo = '001'): PalRecord {
  return {
    internalId: 'SheepBall',
    paldbId: 'lamball',
    paldexNo,
    name: { zhHans: '棉悠悠', en: 'Lamball' },
    elements: ['neutral'],
    rarity: 1,
    workSuitabilities: {},
    partnerSkill: null,
    stats: {
      hp: 1,
      attack: 1,
      defense: 1,
      workSpeed: 1,
      walkSpeed: 1,
      runSpeed: 1,
      swimSpeed: 1,
      rideSprintSpeed: 1,
      transportSpeed: 1,
      stamina: 1,
      foodAmount: 1,
    },
    statSources: {
      hp: 'paldb',
      attack: 'paldb',
      defense: 'paldb',
      workSpeed: 'paldb',
      walkSpeed: 'paldb',
      runSpeed: 'paldb',
      swimSpeed: 'paldb',
      rideSprintSpeed: 'palcalc',
      transportSpeed: 'palcalc',
      stamina: 'paldb',
      foodAmount: 'paldb',
    },
    activeSkills: [],
    passiveSkills: [],
    drops: [],
    image: {
      localPath: '/generated/pals/SheepBall.webp',
      sourceUrl: 'https://example.invalid/SheepBall.webp',
      sha256: 'a'.repeat(64),
    },
    sourceUrl: 'https://example.invalid/SheepBall',
  }
}

describe('BreedingPalAvatar', () => {
  it('renders an accessible interactive avatar and activates it', async () => {
    const onActivate = vi.fn()
    const user = userEvent.setup()
    const { rerender } = render(
      <BreedingPalAvatar
        mode="interactive"
        pal={makePal()}
        selected={false}
        onActivate={onActivate}
        size="formula"
      />,
    )

    const button = screen.getByRole('button', { name: '#001 · 棉悠悠，选择帕鲁' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(button).toHaveClass('breeding-pal-avatar--interactive')
    expect(button.querySelector('.pal-image--formula')).toBeInTheDocument()
    await user.click(button)
    expect(onActivate).toHaveBeenCalledOnce()

    rerender(
      <BreedingPalAvatar
        mode="interactive"
        pal={makePal()}
        selected
        onActivate={onActivate}
        size="formula"
      />,
    )
    expect(screen.getByRole('button', {
      name: '#001 · 棉悠悠，已选中，再次激活前往图鉴',
    })).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveClass('is-selected')
  })

  it('portals a viewport-bounded tooltip on hover and focus', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('breeding-pal-avatar-tooltip')) {
        return { width: 100, height: 30 } as DOMRect
      }
      return {
        left: 100,
        right: 140,
        top: 100,
        bottom: 140,
        width: 40,
        height: 40,
      } as DOMRect
    })
    const { container } = render(
      <BreedingPalAvatar
        mode="interactive"
        pal={makePal()}
        selected={false}
        onActivate={() => {}}
      />,
    )
    const button = screen.getByRole('button')

    fireEvent.pointerEnter(button)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('#001 · 棉悠悠')
    expect(document.body).toContainElement(tooltip)
    expect(container).not.toContainElement(tooltip)
    expect(button).toHaveAttribute('aria-describedby', tooltip.id)
    await waitFor(() => {
      expect(tooltip).toHaveStyle({ position: 'fixed', left: '70px', top: '62px' })
      expect(tooltip).toHaveAttribute('data-placement', 'above')
    })

    fireEvent.pointerLeave(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(button)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    fireEvent.blur(button)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders preview-only mode without interactive semantics and falls back to the internal ID', async () => {
    render(<BreedingPalAvatar mode="previewOnly" pal={makePal('')} size="tree" />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    const preview = document.querySelector('.breeding-pal-avatar--preview') as HTMLElement
    expect(preview).toBeInTheDocument()
    expect(preview.querySelector('.pal-image--tree')).toBeInTheDocument()
    fireEvent.pointerEnter(preview)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('SheepBall · 棉悠悠')
  })

  it('flips and clamps a tooltip when there is no room above the avatar', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('breeding-pal-avatar-tooltip')) {
        return { width: 100, height: 40 } as DOMRect
      }
      return {
        left: 2,
        right: 42,
        top: 2,
        bottom: 42,
        width: 40,
        height: 40,
      } as DOMRect
    })
    vi.stubGlobal('innerWidth', 200)
    vi.stubGlobal('innerHeight', 120)
    render(<BreedingPalAvatar mode="previewOnly" pal={makePal()} />)

    const preview = document.querySelector('.breeding-pal-avatar--preview') as HTMLElement
    fireEvent.pointerEnter(preview)
    const tooltip = await screen.findByRole('tooltip')
    await waitFor(() => {
      expect(tooltip).toHaveStyle({ left: '8px', top: '50px' })
      expect(tooltip).toHaveAttribute('data-placement', 'below')
    })
  })
})
