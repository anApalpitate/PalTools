// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BreedingPage } from './BreedingPage'

afterEach(cleanup)

describe('BreedingPage', () => {
  it('owns breeding mode navigation and the lazy-index loading state', () => {
    render(
      <BreedingPage
        pals={[]}
        breedingIndex={null}
        graphStorage={{ status: 'ready', error: '' }}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '配种工具' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '配种功能' })).toBeInTheDocument()
    expect(screen.getByText('正在载入配方索引…')).toBeInTheDocument()
  })

  it('provides a stable graph entry without the retired path planner', () => {
    render(
      <BreedingPage
        pals={[]}
        breedingIndex={null}
        graphStorage={{ status: 'ready', error: '' }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '帕鲁配种图' }))
    expect(
      screen.getByRole('heading', { name: '帕鲁配种图' }),
    ).toBeInTheDocument()
    expect(screen.getByText('本机图数据仓储已就绪。')).toBeInTheDocument()
    expect(screen.queryByText('路径规划')).not.toBeInTheDocument()
  })
})
