// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaldexPage } from './PaldexPage'

afterEach(cleanup)

describe('PaldexPage', () => {
  it('owns the Paldex heading, filters, and loading state', () => {
    render(
      <PaldexPage
        pals={[]}
        elementRecords={[]}
        skills={[]}
        items={[]}
        workSuitabilityRecords={[]}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '帕鲁图鉴' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '图鉴筛选' })).toBeInTheDocument()
    expect(screen.getByLabelText('图鉴加载中')).toBeInTheDocument()
  })
})
