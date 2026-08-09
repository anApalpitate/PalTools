// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BreedingIndexPayload, PalRecord } from '../../domain/types'
import { BreedingPage } from './BreedingPage'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function makePal(
  internalId: string,
  paldexNo: string,
  zhHans: string,
  en: string,
): PalRecord {
  return {
    internalId,
    paldbId: en,
    paldexNo,
    name: { zhHans, en },
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
      localPath: `/generated/pals/${internalId}.webp`,
      sourceUrl: `https://example.invalid/${internalId}.webp`,
      sha256: 'a'.repeat(64),
    },
    sourceUrl: `https://example.invalid/${internalId}`,
  }
}

const breedingPals = [
  makePal('Alpha', '001', '起点甲', 'Alpha'),
  makePal('Beta', '002', '亲本乙', 'Beta'),
  makePal('Gamma', '003', '目标丙', 'Gamma'),
  makePal('Delta', '004', '目标丁', 'Delta'),
]

const breedingIndex: BreedingIndexPayload = {
  schemaVersion: 4,
  palIds: breedingPals.map((pal) => pal.internalId),
  recipes: [
    [0, 1, 2],
    [0, 1, 3],
    [0, 0, 1],
  ],
  recipesByPair: { '0|1': [0, 1], '0|0': [2] },
  parentsByChild: { '2': [0], '3': [1], '1': [2] },
}

describe('BreedingPage', () => {
  it('owns breeding mode navigation and the lazy-index loading state', () => {
    render(
      <BreedingPage
        pals={[]}
        breedingIndex={null}
      />,
    )

    expect(
      screen.getByRole('heading', { name: '配种工具' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: '配种功能' })).toBeInTheDocument()
    expect(screen.getByText('正在载入配方索引…')).toBeInTheDocument()
  })

  it('exposes the automatic solution network without the retired manual graph', () => {
    render(
      <BreedingPage
        pals={[]}
        breedingIndex={null}
      />,
    )

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: '配种方案网' })).toBeInTheDocument()
    expect(screen.queryByText('帕鲁配种图')).not.toBeInTheDocument()
  })

  it('expands, filters and clears recipes when either parent picker is used alone', () => {
    render(
      <BreedingPage
        pals={breedingPals}
        breedingIndex={breedingIndex}
      />,
    )

    const parentAInput = screen.getByLabelText('选择第一只帕鲁')
    const parentBInput = screen.getByLabelText('选择第二只帕鲁')
    fireEvent.change(parentBInput, {
      target: { value: '亲本乙 · Beta · #002' },
    })

    expect(
      screen.getByLabelText('亲本乙加起点甲得到目标丙'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('亲本乙加起点甲得到目标丁'),
    ).toBeInTheDocument()
    expect(
      document.querySelector('.single-parent-controls .reverse-summary'),
    ).toHaveTextContent('2 条匹配配方 · 共 2 条')

    fireEvent.change(screen.getByLabelText('筛选单亲配方'), {
      target: { value: 'mubiaoding' },
    })
    expect(
      screen.queryByLabelText('亲本乙加起点甲得到目标丙'),
    ).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('亲本乙加起点甲得到目标丁'),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('筛选单亲配方'), {
      target: { value: '不存在' },
    })
    expect(screen.getByText('没有匹配的配方')).toBeInTheDocument()

    fireEvent.change(parentAInput, {
      target: { value: '起点甲 · Alpha · #001' },
    })
    expect(screen.queryByLabelText('筛选单亲配方')).not.toBeInTheDocument()
    expect(
      screen.getByLabelText('起点甲加亲本乙得到目标丙'),
    ).toBeInTheDocument()
    expect(
      screen.getByLabelText('起点甲加亲本乙得到目标丁'),
    ).toBeInTheDocument()

    fireEvent.change(parentBInput, { target: { value: '' } })
    expect(screen.getByLabelText('筛选单亲配方')).toBeInTheDocument()
    expect(
      screen.getByLabelText('起点甲加起点甲得到亲本乙'),
    ).toBeInTheDocument()

    fireEvent.change(parentAInput, { target: { value: '' } })
    expect(screen.getByText('等待选择亲本')).toBeInTheDocument()
  })

  it('collects a query recipe and adds it to the persistent default plan', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const user = userEvent.setup()
    render(
      <BreedingPage
        pals={breedingPals}
        breedingIndex={breedingIndex}
        datasetVersion="v1"
      />,
    )

    fireEvent.change(screen.getByLabelText('选择第一只帕鲁'), {
      target: { value: '起点甲 · Alpha · #001' },
    })
    fireEvent.change(screen.getByLabelText('选择第二只帕鲁'), {
      target: { value: '亲本乙 · Beta · #002' },
    })
    await waitFor(() => expect(screen.getAllByRole('button', { name: '加入关系背包' })[0]).toBeEnabled())
    await user.click(screen.getAllByRole('button', { name: '加入关系背包' })[0])
    await waitFor(() => expect(screen.getAllByRole('button', { name: /已在关系背包/ })[0]).toBeDisabled())

    await user.click(screen.getByRole('tab', { name: '配种方案网' }))
    expect(await screen.findByRole('heading', { name: '关系背包' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: '加入当前方案' }))
    await waitFor(() => expect(screen.getByText('步骤 1')).toBeInTheDocument())
    expect(screen.getAllByText(/起点甲 \+ 亲本乙 → 目标丙/)).not.toHaveLength(0)
  })

})
