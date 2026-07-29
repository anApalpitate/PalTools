// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BreedingPage } from './BreedingPage'

afterEach(cleanup)

describe('BreedingPage', () => {
  it('owns breeding mode navigation and the lazy-index loading state', () => {
    render(
      <BreedingPage
        pals={[]}
        breedingIndex={null}
        appConfig={{
          schemaVersion: 1,
          pathPlanner: { maxExactGeneration: 6 },
        }}
        owned={{
          ownedIds: [],
          setOwnedIds: vi.fn(),
          dirty: false,
          savedFeedback: false,
          save: vi.fn(),
          confirmLeave: () => true,
        }}
        onOpenSettings={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '配种工具' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '配种功能' })).toBeInTheDocument()
    expect(screen.getByText('正在载入配方索引…')).toBeInTheDocument()
  })
})
