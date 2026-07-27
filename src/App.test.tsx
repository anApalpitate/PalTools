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
  passiveSkills: [],
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
  activeSkills: [],
  drops: [],
  image: { ...lamball.image, localPath: '/generated/pals/Cattiva.webp' },
  sourceUrl: 'https://paldb.cn/pals/Cattiva',
}

const manifest: DatasetManifest = {
  schemaVersion: 3,
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
        return Promise.resolve(jsonResponse({ schemaVersion: 3, pals: [lamball, cattiva] }))
      }
      if (url.includes('elements.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 3,
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
          schemaVersion: 3,
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
          schemaVersion: 3,
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
      if (url.includes('manifest.json')) {
        return Promise.resolve(jsonResponse(manifest))
      }
      if (url.includes('breeding-index.json')) {
        return Promise.resolve(jsonResponse({
          schemaVersion: 3,
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
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('opens a detail with complete active skill and drop information', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('棉悠悠')
    await user.click(screen.getByRole('button', { name: /棉悠悠/ }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('滚滚毛球')
    expect(dialog).toHaveTextContent('威力：40')
    expect(dialog).toHaveTextContent('羊毛')
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
    fireEvent.change(screen.getByLabelText('选择第一只帕鲁'), {
      target: { value: '棉悠悠 · Lamball · #001' },
    })
    fireEvent.change(screen.getByLabelText('选择第二只帕鲁'), {
      target: { value: '捣蛋猫 · Cattiva · #002' },
    })
    const equation = await screen.findByLabelText('棉悠悠加捣蛋猫得到捣蛋猫')
    expect(within(equation).getByAltText('棉悠悠')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '子代反查亲本' }))
    fireEvent.change(screen.getByLabelText('选择目标子代'), {
      target: { value: '捣蛋猫 · Cattiva · #002' },
    })
    expect(await screen.findByText(/条亲本公式/)).toHaveTextContent('条亲本公式')
    expect(screen.getByText('1', { selector: '.reverse-summary strong' })).toBeInTheDocument()
  })

  it('uses default admin limit and persists a valid change', async () => {
    mockDataFetch()
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '管理员配置' }))
    const input = screen.getByLabelText('指定代数上限')
    expect(input).toHaveValue(6)
    await user.clear(input)
    await user.type(input, '8')
    await user.click(screen.getByRole('button', { name: '保存配置' }))
    expect(localStorage.getItem('paltools.admin-config.v1')).toContain('"maxExactGeneration":8')
  })
})
