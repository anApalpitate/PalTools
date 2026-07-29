// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { DatasetManifest, PalRecord } from './domain/types'

const lamball: PalRecord = {
  internalId: 'SheepBall',
  paldbId: 'Lamball',
  paldexNo: '001',
  name: { zhHans: '棉悠悠', en: 'Lamball' },
  elements: ['neutral'],
  rarity: 1,
  workSuitabilities: { 手工作业: 1 },
  partnerSkill: {
    name: '茸茸盾牌',
    description: '发动后化身为盾牌。',
  },
  stats: {
    hp: 70,
    attack: 70,
    defense: 70,
    workSpeed: 100,
    walkSpeed: 40,
    runSpeed: 400,
    swimSpeed: 120,
    rideSprintSpeed: 550,
    transportSpeed: 160,
    stamina: 100,
    foodAmount: 3,
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
  activeSkills: [{ skillId: 'Roly_Poly', unlockLevel: 1 }],
  passiveSkills: [
    {
      name: '棉花糖般的超长固有被动技能名称',
      description: '减少受到的伤害。',
      rank: 2,
    },
    {
      name: '温顺',
      description: '更容易与伙伴相处。',
      rank: null,
    },
  ],
  drops: [
    {
      itemId: 'Wool',
      quantityMin: 1,
      quantityMax: 3,
      probabilityPercent: 100,
      requiredLevel: null,
    },
  ],
  image: {
    localPath: '/generated/pals/Lamball.webp',
    sourceUrl: 'https://paldb.cn/lamball.webp',
    sha256: 'a'.repeat(64),
  },
  sourceUrl: 'https://paldb.cn/pals/Lamball',
}

const cattiva: PalRecord = {
  ...lamball,
  internalId: 'PinkCat',
  paldbId: 'Cattiva',
  paldexNo: '002',
  name: { zhHans: '捣蛋猫', en: 'Cattiva' },
  rarity: 10,
  activeSkills: [],
  passiveSkills: [],
  drops: [],
  workSuitabilities: { 手工作业: 1, 搬运: 1 },
  stats: { ...lamball.stats, runSpeed: 500 },
  image: { ...lamball.image, localPath: '/generated/pals/Cattiva.webp' },
  sourceUrl: 'https://paldb.cn/pals/Cattiva',
}

const manifest: DatasetManifest = {
  schemaVersion: 4,
  datasetVersion: '2026.07.27.1',
  gameReleaseLine: '1.0',
  gameBuildId: '24181527',
  generatedAt: '2026-07-27T00:00:00.000Z',
  breedingPolicy: { genderMode: 'ignored', normalizedSpecialPairs: 1 },
  sources: [],
  recordCounts: {
    pals: 2,
    recipes: 1,
    localImages: 2,
    elementIcons: 1,
    activeSkills: 1,
    activeSkillRefs: 1,
    passiveSkills: 0,
    drops: 1,
    itemIcons: 1,
    workSuitabilityIcons: 1,
  },
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockDataFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request) => {
      const url = String(input)
      if (url.includes('pals.json')) {
        return Promise.resolve(jsonResponse({ schemaVersion: 4, pals: [lamball, cattiva] }))
      }
      if (url.includes('elements.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 4,
          elements: [{
            id: 'neutral',
            name: { zhHans: '无属性' },
            icon: {
              localPath: '/generated/elements/neutral.webp',
              sourceUrl: 'https://paldb.cn/neutral.webp',
              sha256: 'b'.repeat(64),
            },
          }],
        }))
      }
      if (url.includes('skills.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 4,
          skills: [{
            id: 'Roly_Poly',
            name: '滚滚毛球',
            element: 'neutral',
            attackType: 'melee',
            power: 40,
            cooldownSeconds: 2,
            attackRange: '0–1000',
            effects: [],
            description: '滚动追击敌人。',
            sourceUrl: 'https://paldb.cn/skills/Roly_Poly',
          }],
        }))
      }
      if (url.includes('items.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 4,
          items: [{
            id: 'Wool',
            name: '羊毛',
            icon: {
              localPath: '/generated/items/Wool.webp',
              sourceUrl: 'https://paldb.cn/Wool.webp',
              sha256: 'c'.repeat(64),
            },
          }],
        }))
      }
      if (url.includes('work-suitabilities.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 4,
          workSuitabilities: ['手工作业', '搬运'].map((name, index) => ({
            name,
            icon: {
              localPath: `/generated/work-suitabilities/work-${index}.webp`,
              sourceUrl: `https://paldb.cn/work-${index}.webp`,
              sha256: 'd'.repeat(64),
            },
          })),
        }))
      }
      if (url.includes('manifest.json')) {
        return Promise.resolve(jsonResponse(manifest))
      }
      if (url.includes('breeding-index.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 4,
          palIds: ['SheepBall', 'PinkCat'],
          recipes: [[0, 1, 1]],
          recipesByPair: { '0|1': [0] },
          parentsByChild: { '1': [0] },
        }))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    }),
  )
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('opens a detail with complete active skill and drop information', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    expect(document.querySelector('.brand-mark img')).toHaveAttribute(
      'src',
      expect.stringContaining('app-icon-96.png'),
    )
    await screen.findByText('棉悠悠')
    expect(screen.getByText('版本 0.1.0')).toBeInTheDocument()
    expect(
      screen.queryByText(`数据 ${manifest.datasetVersion}`),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /棉悠悠/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('滚滚毛球')
    expect(dialog).toHaveTextContent('威力：40')
    expect(dialog).toHaveTextContent('羊毛')
    expect(screen.getByRole('img', { name: '稀有度 1' })).toBeInTheDocument()
    expect(dialog.querySelectorAll('.rarity-star--yellow')).toHaveLength(1)
    expect(dialog.querySelectorAll('.rarity-star--empty')).toHaveLength(4)
    expect(screen.getByRole('heading', { name: '固有词条' })).toBeInTheDocument()
    const detailScroll = screen.getByLabelText('帕鲁详情')
    const skillScroll = screen.getByLabelText('主动技能')
    expect(detailScroll).toHaveAttribute('dir', 'rtl')
    expect(detailScroll).toHaveAttribute('tabindex', '0')
    expect(skillScroll).toHaveAttribute('tabindex', '0')
    fireEvent.scroll(detailScroll)
    fireEvent.scroll(skillScroll)
    expect(detailScroll).toHaveClass('is-scrollbar-active')
    expect(skillScroll).toHaveClass('is-scrollbar-active')
    const passiveCard = screen
      .getByText('棉花糖般的超长固有被动技能名称')
      .closest('article')
    expect(passiveCard?.querySelector('header')).toHaveTextContent('Rank 2')
    expect(within(passiveCard as HTMLElement).getByText('减少受到的伤害。')).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')
    await user.click(screen.getByRole('button', { name: '关闭详情' }))
    expect(document.body.style.overflow).toBe('')
  })

  it('shows high rarity as rainbow stars and hides empty intrinsic traits', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('捣蛋猫')
    await user.click(screen.getByRole('button', { name: /捣蛋猫/ }))
    const dialog = screen.getByRole('dialog')
    expect(screen.getByRole('img', { name: '稀有度 10' })).toBeInTheDocument()
    expect(dialog.querySelectorAll('.rarity-star--rainbow')).toHaveLength(5)
    expect(screen.queryByRole('heading', { name: '固有词条' })).not.toBeInTheDocument()
  })

  it('searches active skills and drops', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    await user.type(screen.getByLabelText('搜索帕鲁'), '滚滚毛球')
    expect(screen.getByText('棉悠悠')).toBeInTheDocument()
    expect(screen.queryByText('捣蛋猫')).not.toBeInTheDocument()
  })

  it('searches pals by partial pinyin, initials and pure numeric paldex number', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    const input = screen.getByLabelText('搜索帕鲁')

    await user.type(input, 'ianyou')
    expect(screen.getByText('棉悠悠')).toBeInTheDocument()
    expect(screen.queryByText('捣蛋猫')).not.toBeInTheDocument()

    await user.clear(input)
    await user.type(input, 'MYY')
    expect(screen.getByText('棉悠悠')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '2')
    expect(screen.getByText('捣蛋猫')).toBeInTheDocument()
    expect(screen.queryByText('棉悠悠')).not.toBeInTheDocument()
  })

  it('queries forward and reverse recipes without gender controls', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    await user.click(screen.getByRole('button', { name: '配种' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data/breeding-index.json')),
    )
    expect(screen.queryByRole('combobox', { name: /性别/ })).not.toBeInTheDocument()
    expect(screen.queryByText('不限性别')).not.toBeInTheDocument()
    const parentAInput = screen.getByLabelText('选择第一只帕鲁') as HTMLInputElement
    fireEvent.change(parentAInput, {
      target: { value: '棉悠悠 · Lamball · #001' },
    })
    await user.click(parentAInput)
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(parentAInput).toHaveAttribute(
      'aria-activedescendant',
      'parent-a-option-SheepBall',
    )
    await waitFor(() => {
      expect(parentAInput.selectionStart).toBe(0)
      expect(parentAInput.selectionEnd).toBe(parentAInput.value.length)
    })
    fireEvent.change(parentAInput, { target: { value: '捣蛋' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(parentAInput, { key: 'Escape' })
    expect(parentAInput).toHaveValue('棉悠悠 · Lamball · #001')
    fireEvent.change(screen.getByLabelText('选择第二只帕鲁'), {
      target: { value: '捣蛋猫 · Cattiva · #002' },
    })
    const equation = await screen.findByLabelText('棉悠悠加捣蛋猫得到捣蛋猫')
    expect(within(equation).getByAltText('棉悠悠')).toBeInTheDocument()
    expect(equation.closest('.result-card')?.querySelector('.result-summary')).toBeNull()

    await user.click(screen.getByRole('button', { name: '子代反查亲本' }))
    fireEvent.change(screen.getByLabelText('选择目标子代'), {
      target: { value: '捣蛋猫 · Cattiva · #002' },
    })
    expect(await screen.findByText(/条亲本公式/)).toHaveTextContent('条亲本公式')
    expect(screen.getByText('1', { selector: '.reverse-summary strong' })).toBeInTheDocument()
    expect(document.querySelectorAll('.result-summary')).toHaveLength(0)
  })

  it('keeps an in-progress picker query when clicking the input and closes after choosing', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    await user.click(screen.getByRole('button', { name: '配种' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data/breeding-index.json')),
    )
    const input = screen.getByLabelText('选择第一只帕鲁')
    await user.click(input)
    await user.type(input, '捣蛋')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(input)
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.click(screen.getByRole('option', { name: /捣蛋猫/ }))
    expect(input).toHaveValue('捣蛋猫 · Cattiva · #002')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('combines work filters with stat sorting and shows the sorted value', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    expect(screen.queryByLabelText('适性最低')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '手工作业' }))
    await user.click(screen.getByRole('button', { name: '搬运' }))
    expect(screen.queryByText('棉悠悠')).not.toBeInTheDocument()
    expect(screen.getByText('捣蛋猫')).toBeInTheDocument()
    const card = screen.getByRole('button', { name: /#002 捣蛋猫/ })
    expect(card.querySelectorAll('.work-row .is-filter-match')).toHaveLength(2)
    await user.selectOptions(screen.getByLabelText('排序依据'), 'runSpeed')
    expect(screen.getByText('500')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '全部适性' }))
    expect(screen.getByText('棉悠悠')).toBeInTheDocument()
    expect(screen.getByText('捣蛋猫')).toBeInTheDocument()
  })

  it('sorts the default paldex order in both directions and resets to ascending', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    const sortKey = screen.getByLabelText('排序依据')
    const direction = screen.getByLabelText('排列方式')
    expect(sortKey).toHaveValue('paldexNo')
    expect(direction).toBeEnabled()
    expect(direction).toHaveValue('asc')
    expect(document.querySelector('.pal-card .paldex-number')).toHaveTextContent('#001')

    await user.selectOptions(direction, 'desc')
    expect(document.querySelector('.pal-card .paldex-number')).toHaveTextContent('#002')
    await user.type(screen.getByLabelText('搜索帕鲁'), '捣蛋')
    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(sortKey).toHaveValue('paldexNo')
    expect(direction).toHaveValue('asc')
    expect(screen.getByLabelText('搜索帕鲁')).toHaveValue('')
    expect(document.querySelector('.pal-card .paldex-number')).toHaveTextContent('#001')
  })

  it('only persists owned pals after an explicit save and hides exact generation', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    await user.click(screen.getByRole('button', { name: '配种' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data/breeding-index.json')),
    )
    await user.click(screen.getByRole('button', { name: '路径规划' }))
    expect(screen.queryByLabelText('指定代数')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('添加已拥有帕鲁'), {
      target: { value: '棉悠悠 · Lamball · #001' },
    })
    await user.click(screen.getByRole('button', { name: '加入起点' }))
    expect(localStorage.getItem('paltools.path-starts.v1')).toBeNull()
    await user.click(screen.getByRole('button', { name: '保存到本机' }))
    expect(localStorage.getItem('paltools.path-starts.v1')).toContain('SheepBall')
    await user.click(screen.getByRole('button', { name: '移除棉悠悠' }))
    expect(localStorage.getItem('paltools.path-starts.v1')).toContain('SheepBall')
    await user.click(screen.getByRole('button', { name: '保存到本机' }))
    expect(localStorage.getItem('paltools.path-starts.v1')).not.toContain('SheepBall')
    await user.selectOptions(screen.getByLabelText('规划方式'), 'exact')
    expect(screen.getByLabelText('指定代数')).toBeInTheDocument()
  })

  it('warns before leaving or unloading with unsaved owned pals', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    await screen.findByText('棉悠悠')
    await user.click(screen.getByRole('button', { name: '配种' }))
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('data/breeding-index.json')),
    )
    await user.click(screen.getByRole('button', { name: '路径规划' }))
    fireEvent.change(screen.getByLabelText('添加已拥有帕鲁'), {
      target: { value: '棉悠悠 · Lamball · #001' },
    })
    await user.click(screen.getByRole('button', { name: '加入起点' }))
    expect(screen.getByText('有未保存更改')).toBeInTheDocument()
    expect(
      screen.getByText('棉悠悠', { selector: '.selected-pal-tag strong' })
        .closest('.selected-pal-tag'),
    ).toHaveAttribute('title', 'Lamball · #001')

    const unloadEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unloadEvent)
    expect(unloadEvent.defaultPrevented).toBe(true)

    await user.click(screen.getByRole('button', { name: '图鉴' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '配种工具' })).toBeInTheDocument()

    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: '图鉴' }))
    expect(screen.getByRole('heading', { name: '帕鲁图鉴' })).toBeInTheDocument()
  })

  it('uses default advanced limit and persists a valid change', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '设置' }))
    const input = screen.getByLabelText('指定代数上限')
    expect(input).toHaveValue(6)
    await user.clear(input)
    await user.type(input, '8')
    await user.click(screen.getByRole('button', { name: '保存配置' }))
    expect(localStorage.getItem('paltools.admin-config.v1')).toContain('"maxExactGeneration":8')
  })

  it('switches among registered themes and persists the preference', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '设置' }))

    expect(screen.getAllByRole('radio')).toHaveLength(5)
    await user.click(screen.getByRole('radio', { name: /晴空浅蓝/ }))

    expect(document.documentElement.dataset.theme).toBe('sky')
    expect(localStorage.getItem('paltools.theme.v1')).toBe(
      '{"schemaVersion":1,"themeId":"sky"}',
    )
  })
})
