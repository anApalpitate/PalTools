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
  rarity = 1,
): PalRecord {
  return {
    internalId,
    paldbId: en,
    paldexNo,
    name: { zhHans, en },
    elements: ['neutral'],
    rarity,
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
      document.querySelector('.recipe-query-toolbar .reverse-summary'),
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
    vi.stubGlobal('DOMMatrixReadOnly', class {
      m22 = 1
    })
    vi.stubGlobal('ResizeObserver', class {
      private readonly callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe(target: Element) {
        this.callback([{
          target,
          contentRect: { width: 1100, height: 560 } as DOMRectReadOnly,
        } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }

      unobserve() {}
      disconnect() {}
    })
    const user = userEvent.setup()
    const workspacePals = [...breedingPals, makePal('WeaselDragon', '103', '疾旋鼬', 'Chillet')]
    const workspaceIndex = { ...breedingIndex, palIds: workspacePals.map((pal) => pal.internalId) }
    const { container } = render(
      <BreedingPage
        pals={workspacePals}
        breedingIndex={workspaceIndex}
        datasetVersion="v1"
      />,
    )

    fireEvent.change(screen.getByLabelText('选择第一只帕鲁'), {
      target: { value: '起点甲 · Alpha · #001' },
    })
    fireEvent.change(screen.getByLabelText('选择第二只帕鲁'), {
      target: { value: '亲本乙 · Beta · #002' },
    })
    const addButton = await waitFor(() => {
      const button = screen.getAllByRole('button', { name: '加入配方背包' })[0]
      expect(button).toBeEnabled()
      return button
    })
    expect(addButton).toHaveTextContent('+')
    expect(addButton).toHaveAttribute('title', '加入配方背包')
    await user.click(addButton)
    await waitFor(() => {
      const addedButton = screen.getAllByRole('button', { name: '已加入配方背包' })[0]
      expect(addedButton).toBeDisabled()
      expect(addedButton).toHaveTextContent('✓')
      expect(addedButton).toHaveAttribute('title', '已加入配方背包')
    })

    await user.click(screen.getByRole('tab', { name: '配种方案网' }))
    expect(await screen.findByRole('heading', { name: '配方背包' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '选择方案' })).toBeInTheDocument()
    const filterRow = container.querySelector('.bag-filter-row') as HTMLElement
    const filterButtons = [...filterRow.querySelectorAll('button')]
    expect(filterButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      '全选当前列表',
      '隐藏已加入当前方案的配方',
      '显示自交配方',
      '背包排序字段：按加入时间排序',
      '背包排序方向：倒序',
    ])
    expect(screen.getByRole('button', { name: '隐藏已加入当前方案的配方' }).querySelector('.bag-joined-filter-icon')).toBeInTheDocument()
    const selfFilter = screen.getByRole('button', { name: '显示自交配方' })
    expect(selfFilter).toHaveAttribute('aria-pressed', 'true')
    expect(selfFilter.querySelector('img')).toHaveAttribute('alt', '疾旋鼬')
    expect(selfFilter.querySelector('.bag-filter-slash')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '背包排序方向：倒序' })).toHaveTextContent('▼')
    await user.click(screen.getByRole('button', { name: '背包排序字段：按加入时间排序' }))
    expect(screen.getByRole('button', { name: '背包排序字段：按配方编号排序' })).toBeInTheDocument()
    expect(screen.queryByText('当前方案')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.bag-relation-row .pal-image--mini')).toHaveLength(3)
    expect(container.querySelectorAll('.relation-bag .workspace-recipe-pal--stacked')).toHaveLength(3)
    expect(container.querySelector('.bag-relation-meta')).toHaveTextContent('#0')
    await user.click(screen.getByRole('button', { name: '全选当前列表' }))
    expect(screen.getByRole('checkbox')).toBeChecked()
    await user.click(screen.getByRole('button', { name: '批量加入' }))
    await waitFor(() => expect(screen.getByText('步骤 1')).toBeInTheDocument())
    const bagMeta = container.querySelector('.bag-relation-meta')
    expect(bagMeta?.querySelector('.bag-relation-status')).toHaveTextContent('已在当前方案中')
    expect(bagMeta?.querySelector('.bag-relation-index')).toHaveTextContent('#0')
    expect(screen.getByRole('button', { name: '加入当前方案配方 0' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '移出配方背包配方 0' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('起点甲加亲本乙得到目标丙')).toHaveLength(2)
    expect(container.querySelectorAll('.plan-step .pal-image--mini')).toHaveLength(3)
    expect(container.querySelectorAll('.plan-step .workspace-recipe-pal-copy small')).toHaveLength(3)
    expect(container.querySelector('.plan-step .recipe-index-badge')).toHaveTextContent('配方 #0')
    expect(screen.queryByText('单条关系已使用简洁视图')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: '节点模式' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: '图形网' }))
    expect(screen.getByText('单条关系已使用简洁视图')).toBeInTheDocument()
    await waitFor(() => {
      expect(container.querySelectorAll('.workspace-graph-recipe-junction')).toHaveLength(1)
    }, { timeout: 5_000 })
    expect(container.querySelectorAll('.react-flow__handle-left, .react-flow__handle-right')).toHaveLength(0)
    await user.click(screen.getByRole('radio', { name: '关系列表' }))
    expect(screen.queryByText('单条关系已使用简洁视图')).not.toBeInTheDocument()
    await waitFor(() => expect(container.querySelectorAll('.plan-relation-row .pal-image--mini')).toHaveLength(3))
    expect(container.querySelector('.plan-relation-row .recipe-index-badge')).toHaveTextContent('配方 #0')
  }, 15_000)

  it('gives an empty recipe bag clear entry points to both queries', async () => {
    vi.stubGlobal('indexedDB', new IDBFactory())
    const user = userEvent.setup()
    render(<BreedingPage pals={breedingPals} breedingIndex={breedingIndex} datasetVersion="v1" />)

    await user.click(screen.getByRole('tab', { name: '配种方案网' }))
    expect(await screen.findByText('配方背包为空')).toBeInTheDocument()
    expect(screen.queryByText('配方背包为空。')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '双亲查询' }))
    expect(screen.getByRole('tab', { name: '双亲查子代' })).toHaveAttribute('aria-selected', 'true')
  })

  it('filters self-only legendary pals, sorts by average rarity and renders graphical rarity', async () => {
    const legend = makePal('Legend', '100', '传说兽', 'Legend', 10)
    const jetragon = makePal('JetDragon', '202', '空涡龙', 'Jetragon', 10)
    const cattiva = makePal('PinkCat', '002B', '捣蛋猫', 'Cattiva', 1)
    const pals = [...breedingPals, legend, jetragon, cattiva]
    const index: BreedingIndexPayload = {
      schemaVersion: 4,
      palIds: pals.map((pal) => pal.internalId),
      recipes: [
        [0, 1, 2],
        [0, 4, 2],
        [4, 4, 4],
        [0, 0, 2],
      ],
      recipesByPair: { '0|1': [0], '0|4': [1], '4|4': [2], '0|0': [3] },
      parentsByChild: { '2': [0, 1, 3], '4': [2] },
    }
    render(<BreedingPage pals={pals} breedingIndex={index} />)

    fireEvent.change(screen.getByLabelText('选择第一只帕鲁'), {
      target: { value: '起点甲 · Alpha · #001' },
    })
    expect(screen.getByRole('img', { name: '传说帕鲁' })).toBeInTheDocument()
    expect(document.querySelector('.formula-pal.is-legendary .pal-image')).toBeInTheDocument()
    expect(document.querySelectorAll('.result-card .formula-rarity .rarity-stars')).toHaveLength(9)
    expect(screen.getByRole('img', { name: '空涡龙' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '捣蛋猫' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', {
      name: '正向查询配方排序：按编号',
    }))
    expect(screen.getByRole('button', {
      name: '正向查询配方排序：按稀有度',
    })).toBeInTheDocument()
    expect(document.querySelector('.result-card')).not.toHaveTextContent('传说兽')
    const directionButton = screen.getByRole('button', {
      name: '正向查询配方排序方向：正序',
    })
    expect(directionButton).toHaveTextContent('▲')
    expect(directionButton).toHaveAttribute('title', '正序，点击切换为倒序')
    fireEvent.click(directionButton)
    expect(screen.getByRole('button', {
      name: '正向查询配方排序方向：倒序',
    })).toHaveTextContent('▼')
    expect(document.querySelector('.result-card')).toHaveTextContent('传说兽')

    fireEvent.click(screen.getByLabelText('正向查询排除同种配种'))
    expect(screen.queryByLabelText('起点甲加起点甲得到目标丙')).not.toBeInTheDocument()
    expect(screen.getByLabelText('正向查询已排除同种配种，点击取消')).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelectorAll('.recipe-filter-slash')).toHaveLength(1)
    fireEvent.click(screen.getByLabelText('正向查询排除传说帕鲁'))
    expect(screen.queryByText('传说兽')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.result-card')).toHaveLength(1)

    fireEvent.click(screen.getByRole('tab', { name: '获取目标帕鲁' }))
    fireEvent.change(screen.getByLabelText('选择目标子代'), {
      target: { value: '目标丙 · Gamma · #003' },
    })
    expect(screen.getByRole('button', {
      name: '目标反查配方排序：按编号',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: '目标反查配方排序方向：正序',
    })).toHaveTextContent('▲')
    expect(screen.getByRole('img', { name: '传说帕鲁' })).toBeInTheDocument()
    expect(screen.getByLabelText('起点甲加起点甲得到目标丙')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('目标反查排除同种配种'))
    expect(screen.queryByLabelText('起点甲加起点甲得到目标丙')).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('目标反查排除传说帕鲁'))
    expect(screen.queryByText('传说兽')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.recipe-filter-slash')).toHaveLength(2)
  })

})
