// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderProfile, type ProviderProfileV1 } from '../../domain/agent'
import type { ActiveSkillRecord, ItemRecord, PalRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { ProviderService } from '../../lib/provider-service'
import { AssistantPage } from './AssistantPage'

const pal: PalRecord = {
  internalId: 'SheepBall', paldbId: 'Lamball', paldexNo: '001', name: { zhHans: '棉悠悠', en: 'Lamball' }, elements: ['neutral'], rarity: 1,
  workSuitabilities: { 手工作业: 1 }, partnerSkill: { name: '茸茸盾牌', description: '化身为盾牌。' },
  stats: { hp: 70, attack: 70, defense: 70, workSpeed: 100, walkSpeed: 40, runSpeed: 400, swimSpeed: 120, rideSprintSpeed: 550, transportSpeed: 160, stamina: 100, foodAmount: 3 }, statSources: {},
  activeSkills: [], passiveSkills: [], drops: [], image: { localPath: '/generated/pals/Lamball.webp', sourceUrl: 'https://example.com/image', sha256: 'a'.repeat(64) }, sourceUrl: 'https://example.com/pal',
}

const cattiva: PalRecord = {
  ...pal,
  internalId: 'PinkCat',
  paldbId: 'Cattiva',
  paldexNo: '002',
  name: { zhHans: '捣蛋猫', en: 'Cattiva' },
  image: { ...pal.image, localPath: '/generated/pals/Cattiva.webp' },
}

const skill: ActiveSkillRecord = {
  id: 'FireBall', name: '火球', element: 'fire', attackType: 'ranged', power: 100, cooldownSeconds: 10, attackRange: null, effects: [], description: '发射火焰球。', sourceUrl: 'https://example.com/skill',
}

const item: ItemRecord = {
  id: 'Wool', name: '羊毛', icon: { localPath: '/generated/items/Wool.webp', sourceUrl: 'https://example.com/item', sha256: 'b'.repeat(64) },
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  globalThis.IDBKeyRange = IDBKeyRange
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

function installMatchMedia(initialWidth: number) {
  let width = initialWidth
  const records = new Map<string, { media: MediaQueryList; listeners: Set<(event: MediaQueryListEvent) => void> }>()
  const queryMatches = (query: string) => {
    const maxWidth = /max-width:\s*(\d+)px/u.exec(query)?.[1]
    return maxWidth ? width <= Number(maxWidth) : false
  }
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    const existing = records.get(query)
    if (existing) return existing.media
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const media = {
      media: query,
      get matches() { return queryMatches(query) },
      onchange: null,
      addListener: (listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeListener: (listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
      dispatchEvent: () => true,
    } as MediaQueryList
    records.set(query, { media, listeners })
    return media
  }))
  return (nextWidth: number) => {
    width = nextWidth
    for (const { media, listeners } of records.values()) {
      const event = { matches: media.matches, media: media.media } as MediaQueryListEvent
      for (const listener of listeners) listener(event)
    }
  }
}

function setup(profileOverrides: Partial<ProviderProfileV1> = {}) {
  const profile = { ...createProviderProfile('openai'), model: 'test-model', capabilityMode: 'retrieval-only' as const, hasApiKey: true, ...profileOverrides }
  const service = new ProviderService()
  const complete = vi.spyOn(service, 'complete').mockResolvedValue({ text: '本地证据回答。', toolCalls: [] })
  const controller = {
    service,
    snapshot: { profiles: [profile], defaultProfileId: profile.id, encryptionAvailable: false, platform: 'web' as const },
    loading: false, error: '', save: vi.fn(), remove: vi.fn(), setDefault: vi.fn(), refresh: vi.fn(),
  } as unknown as ProviderProfilesController
  render(<AssistantPage pals={[pal, cattiva]} skills={[skill]} items={[item]} breedingIndex={null} datasetVersion="test-v1" providerController={controller} onNavigateConversation={vi.fn()} />)
  return { complete, profile, user: userEvent.setup() }
}

describe('AssistantPage', () => {
  it('keeps the semantic title inside the compact session bar', () => {
    setup()
    const title = screen.getByRole('heading', { name: '帕鲁研究终端', level: 1 })
    expect(title.closest('.assistant-session-bar')).toBeInTheDocument()
    expect(document.querySelector('.assistant-heading')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '研究记录' })).toHaveAttribute('aria-controls', 'assistant-archive-panel')
    expect(screen.getByRole('button', { name: '检索记录' })).toHaveAttribute('aria-controls', 'assistant-evidence-panel')
  })

  it('uses Enter for a newline and modifier plus Enter to send', async () => {
    const { complete, user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')
    expect(textarea).not.toHaveAttribute('role')
    expect(textarea).toHaveAttribute('aria-autocomplete', 'list')
    expect(screen.queryByRole('combobox', { name: '本地工具与资料选择' })).not.toBeInTheDocument()
    expect(textarea).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter Shift+Enter')

    await user.type(textarea, '棉悠悠{Enter}适合做什么')
    expect(textarea).toHaveValue('棉悠悠\n适合做什么')
    expect(complete).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))

    await user.type(textarea, '棉悠悠资料')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))

    await user.type(textarea, '棉悠悠工作适性')
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(3))
  })

  it('does not send repeated or IME-composition shortcuts', async () => {
    const { complete, user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')
    await user.type(textarea, '棉悠悠适合做什么')

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, isComposing: true })
    expect(fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, repeat: true })).toBe(false)
    expect(complete).not.toHaveBeenCalled()

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
  })

  it('selects a tool and entities with @, validates locally, and preserves chips for regeneration', async () => {
    const { complete, user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await user.type(textarea, '@duibi')
    const toolOption = within(screen.getByRole('listbox')).getByRole('option', { name: /帕鲁对比/ })
    await user.click(toolOption)
    expect(await screen.findByText(/请引用 2–4 只帕鲁/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    await user.type(textarea, '@mianyouyou')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '移除棉悠悠' })).toBeInTheDocument()

    await user.type(textarea, '@捣蛋猫')
    await user.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: '移除捣蛋猫' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '发送' }))
    expect(await screen.findByText('本地证据回答。')).toBeInTheDocument()
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(JSON.stringify(complete.mock.calls[0]?.[1])).toContain('compare_pals')
    expect(within(screen.getByLabelText('消息使用的本地引用')).getByText('帕鲁对比')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(JSON.stringify(complete.mock.calls[1]?.[1])).toContain('compare_pals')
  })

  it('searches skill and item aliases while ignoring email and URL at-signs', async () => {
    const { user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await user.type(textarea, 'contact@example.com')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await user.clear(textarea)
    await user.type(textarea, 'https://example.com/@huoqiu')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    await user.clear(textarea)
    await user.type(textarea, '@huoqiu')
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /火球/ })).toHaveAttribute('tabindex', '-1')
    expect(textarea).toHaveAttribute('aria-controls', 'assistant-mention-listbox')
    expect(screen.getByRole('button', { name: '本地工具' })).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(textarea).toHaveFocus()

    await user.clear(textarea)
    await user.type(textarea, '@yangmao')
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: /羊毛/ })).toBeInTheDocument()
  })

  it('lets the user replace a selected reference without editing raw mention text', async () => {
    const { user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await user.type(textarea, '@棉悠悠')
    await user.keyboard('{Enter}')
    await user.click(screen.getByRole('button', { name: '更换棉悠悠' }))
    expect(screen.getByRole('button', { name: '移除棉悠悠' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '移除棉悠悠' })).toBeInTheDocument()
    expect(textarea).toHaveValue('')

    await user.click(screen.getByRole('button', { name: '更换棉悠悠' }))
    await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: /捣蛋猫/ }))
    expect(screen.queryByRole('button', { name: '移除棉悠悠' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除捣蛋猫' })).toBeInTheDocument()
  })

  it('requires an explicit confirmation before treating one pal as both parents', async () => {
    const { user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await user.type(textarea, '@sqczd')
    await user.keyboard('{Enter}')
    await user.type(textarea, '@棉悠悠')
    await user.keyboard('{Enter}')

    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    const confirm = screen.getByRole('button', { name: '按 棉悠悠 × 棉悠悠 查询' })
    await user.click(confirm)

    expect(screen.getByText('双亲查子代 · 同种双亲')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
  })

  it('activates and removes drawer focus isolation when crossing responsive breakpoints', async () => {
    const resize = installMatchMedia(1440)
    const { user } = setup()
    const toggle = screen.getByRole('button', { name: '检索记录' })
    const panel = screen.getByLabelText('本地证据与检索轨迹')

    expect(toggle).toHaveAttribute('aria-label', '检索记录')
    expect(screen.getByRole('button', { name: '研究记录' })).toHaveAttribute('aria-label', '研究记录')
    expect(panel).not.toHaveAttribute('aria-hidden')
    await user.click(toggle)
    act(() => resize(760))
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭检索记录' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: '关闭检索记录' }))
    await waitFor(() => expect(toggle).toHaveFocus())
    expect(panel).toHaveAttribute('aria-hidden', 'true')
    expect(panel).toHaveAttribute('inert')

    act(() => resize(1440))
    await waitFor(() => expect(panel).not.toHaveAttribute('aria-hidden'))
    expect(panel).not.toHaveAttribute('inert')
    expect(screen.getByLabelText('向帕鲁助手提问')).toHaveFocus()

    screen.getByRole('button', { name: '关闭检索记录' }).focus()
    act(() => resize(1152))
    await waitFor(() => expect(panel).toHaveAttribute('aria-hidden', 'true'))
    expect(screen.getByLabelText('向帕鲁助手提问')).toHaveFocus()

    act(() => resize(1440))
    const archivePanel = screen.getByLabelText('对话档案')
    screen.getByRole('button', { name: '关闭研究记录' }).focus()
    act(() => resize(760))
    await waitFor(() => expect(archivePanel).toHaveAttribute('aria-hidden', 'true'))
    expect(screen.getByLabelText('向帕鲁助手提问')).toHaveFocus()
  })

  it('restores drawer focus to the message evidence button that opened it', async () => {
    installMatchMedia(1152)
    const { complete, user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')
    await user.type(textarea, '棉悠悠资料')
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())

    const opener = await screen.findByRole('button', { name: '查看回答的本地证据' })
    await user.click(opener)
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭检索记录' })).toHaveFocus())
    await user.keyboard('{Escape}')
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('asks for data disclosure again when the same profile moves to a new endpoint', async () => {
    const first = setup({ id: 'consent-profile' })
    await first.user.type(screen.getByLabelText('向帕鲁助手提问'), '棉悠悠资料')
    await first.user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(first.complete).toHaveBeenCalledOnce())
    cleanup()

    const second = setup({ id: 'consent-profile', baseUrl: 'https://another-provider.example/v1' })
    await second.user.type(screen.getByLabelText('向帕鲁助手提问'), '再查一次棉悠悠')
    await second.user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(second.complete).toHaveBeenCalledOnce())

    expect(window.confirm).toHaveBeenCalledTimes(2)
  })

  it('aborts an active request from the stop button and restores the composer', async () => {
    const { complete, user } = setup()
    let requestSignal: AbortSignal | undefined
    complete.mockImplementationOnce((_profile, _request, signal) => {
      requestSignal = signal
      return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('已停止', 'AbortError')), { once: true }))
    })
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '棉悠悠资料')
    await user.keyboard('{Control>}{Enter}{/Control}')

    await user.click(await screen.findByRole('button', { name: '停止' }))
    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
    await waitFor(() => expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument())
    expect(screen.getByLabelText('向帕鲁助手提问')).not.toBeDisabled()
  })
})
