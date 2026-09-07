// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderProfile, type ProviderProfile } from '../../domain/agent'
import type { ActiveSkillRecord, ItemRecord, PalRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { ProviderService } from '../../lib/provider-service'
import { AgentRepository, type AgentConversationBundle } from '../../storage/agent-storage'
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

const depresso: PalRecord = {
  ...pal,
  internalId: 'NegativeKoala',
  paldbId: 'Depresso',
  paldexNo: '003',
  name: { zhHans: '寐魔', en: 'Depresso' },
  image: { ...pal.image, localPath: '/generated/pals/Depresso.webp' },
}

const skill: ActiveSkillRecord = {
  id: 'FireBall', name: '火球', element: 'fire', attackType: 'ranged', power: 100, cooldownSeconds: 10, attackRange: null, effects: [], description: '发射火焰球。', sourceUrl: 'https://example.com/skill',
}

const item: ItemRecord = {
  id: 'Wool', name: '羊毛', icon: { localPath: '/generated/items/Wool.webp', sourceUrl: 'https://example.com/item', sha256: 'b'.repeat(64) },
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function profileWithModel(presetId: string, modelId: string, overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  const profile = createProviderProfile(presetId)
  return {
    ...profile,
    ...overrides,
    defaultModelId: overrides.defaultModelId ?? modelId,
    models: overrides.models ?? [{ ...profile.models[0], modelId, capabilityMode: 'retrieval-only' }],
  }
}

function modelTarget(profile: ProviderProfile, modelId = profile.defaultModelId): string {
  return `${encodeURIComponent(profile.id)}|${encodeURIComponent(modelId)}`
}

function conversationBundle(id: string, content: string, profileId: string, modelId = 'test-model'): AgentConversationBundle {
  const createdAt = new Date().toISOString()
  const messageId = `${id}-message`
  return {
    conversation: { id, title: `${id} 研究记录`, profileId, modelId, createdAt, updatedAt: createdAt },
    messages: [{ id: messageId, conversationId: id, role: 'user', content, status: 'complete', createdAt }],
    evidenceByMessage: {},
    tracesByMessage: {},
  }
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

function setup(profileOverrides: Partial<ProviderProfile> = {}, extraProfiles: ProviderProfile[] = [], conversationId?: string, controllerOverrides: Partial<ProviderProfilesController> = {}) {
  const profile = profileWithModel('openai', 'test-model', { hasApiKey: true, ...profileOverrides })
  const service = new ProviderService()
  const complete = vi.spyOn(service, 'complete').mockResolvedValue({ text: '本地证据回答。', toolCalls: [] })
  const onNavigateConversation = vi.fn()
  const controller = {
    service,
    snapshot: { profiles: [profile, ...extraProfiles], defaultProfileId: profile.id, encryptionAvailable: false, platform: 'web' as const },
    loading: false, error: '', save: vi.fn(), remove: vi.fn(), setDefault: vi.fn(), refresh: vi.fn(),
    ...controllerOverrides,
  } as unknown as ProviderProfilesController
  const renderPage = (currentConversationId?: string) => <AssistantPage pals={[pal, cattiva, depresso]} skills={[skill]} items={[item]} breedingIndex={null} datasetVersion="test-v1" conversationId={currentConversationId} providerController={controller} onNavigateConversation={onNavigateConversation} />
  const view = render(renderPage(conversationId))
  return {
    complete,
    profile,
    controller,
    onNavigateConversation,
    rerenderConversation: (currentConversationId?: string) => view.rerender(renderPage(currentConversationId)),
    user: userEvent.setup(),
  }
}

describe('AssistantPage', () => {
  const emptySnapshot: ProviderProfilesController['snapshot'] = { profiles: [], defaultProfileId: '', encryptionAvailable: false, platform: 'web', managedProfileIds: [] }

  it.each([undefined, 'existing-history'])('only mounts configuration guidance without profiles, including route %s', async (conversationId) => {
    const list = vi.spyOn(AgentRepository.prototype, 'listConversations')
    const load = vi.spyOn(AgentRepository.prototype, 'loadConversation')
    const { complete, user } = setup({}, [], conversationId, { snapshot: emptySnapshot })

    expect(screen.getByRole('heading', { name: '先配置模型服务', level: 1 })).toBeInTheDocument()
    expect(document.querySelector('.assistant-workbench')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('向帕鲁助手提问')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('本地证据与检索轨迹')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新建研究记录' })).not.toBeInTheDocument()
    const configure = screen.getByRole('link', { name: '前往配置模型服务' })
    expect(configure).toHaveAttribute('href', '#/settings')
    await user.tab()
    expect(configure).toHaveFocus()
    expect(list).not.toHaveBeenCalled()
    expect(load).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
  })

  it('waits for profiles before showing guidance or mounting the workbench', () => {
    const { controller, rerenderConversation } = setup({}, [], undefined, { loading: true })
    expect(screen.getByRole('status')).toHaveTextContent('正在检查已保存的模型配置…')
    expect(screen.queryByRole('heading', { name: '先配置模型服务' })).not.toBeInTheDocument()
    expect(document.querySelector('.assistant-workbench')).not.toBeInTheDocument()

    controller.loading = false
    rerenderConversation()
    expect(screen.getByLabelText('向帕鲁助手提问')).toBeInTheDocument()
  })

  it.each(['stored', 'development'])('offers retry after a %s profile load failure and recovers', async (source) => {
    const { controller, profile, user, rerenderConversation } = setup({}, [], undefined, {
      snapshot: { ...emptySnapshot, ...(source === 'development' ? { developmentProfileError: '开发者配置不可用' } : {}) },
      error: source === 'stored' ? '模型配置加载失败' : '',
    })
    expect(screen.getByRole('heading', { name: '模型服务加载失败' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('请重试加载')
    expect(document.querySelector('.assistant-workbench')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试加载' }))
    expect(controller.refresh).toHaveBeenCalledTimes(1)

    controller.error = ''
    controller.snapshot = { ...emptySnapshot, profiles: [profile], defaultProfileId: profile.id }
    rerenderConversation()
    expect(screen.getByLabelText('向帕鲁助手提问')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('preserves history when the last profile is removed and restores it after configuration', async () => {
    const profile = profileWithModel('ollama', 'local-model')
    const repository = new AgentRepository()
    const conversation = await repository.createConversation(profile.id)
    await repository.appendMessage({ id: 'retained-user', conversationId: conversation.id, role: 'user', content: '配置前已保存的问题', status: 'complete', createdAt: new Date().toISOString() })
    const { controller, rerenderConversation } = setup(profile, [], conversation.id)
    expect(await screen.findByText('配置前已保存的问题')).toBeInTheDocument()

    controller.snapshot = emptySnapshot
    rerenderConversation(conversation.id)
    expect(screen.getByRole('heading', { name: '先配置模型服务' })).toBeInTheDocument()
    expect(screen.queryByText('配置前已保存的问题')).not.toBeInTheDocument()
    expect((await repository.loadConversation(conversation.id))?.messages).toHaveLength(1)

    controller.snapshot = { ...emptySnapshot, profiles: [profile], defaultProfileId: profile.id }
    rerenderConversation(conversation.id)
    expect(await screen.findByText('配置前已保存的问题')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '先配置模型服务' })).not.toBeInTheDocument()
  })

  it('keeps the semantic title inside the compact session bar', () => {
    setup()
    const title = screen.getByRole('heading', { name: '帕鲁研究终端', level: 1 })
    expect(title.closest('.assistant-session-bar')).toBeInTheDocument()
    expect(document.querySelector('.assistant-heading')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '研究记录' })).toHaveAttribute('aria-controls', 'assistant-archive-panel')
    expect(screen.getByRole('button', { name: '检索记录' })).toHaveAttribute('aria-controls', 'assistant-evidence-panel')
    expect(screen.getByRole('button', { name: '新建研究记录' })).toHaveAttribute('data-tooltip', '新建研究记录')
    expect(screen.getByRole('button', { name: '新建研究记录' })).not.toHaveAttribute('title')
    expect(screen.getByLabelText('模型服务').closest('.assistant-composer')).toBeInTheDocument()
    expect(title.closest('.assistant-session-bar')?.querySelector('select')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toHaveAttribute('data-tooltip', '发送')
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

  it('only exposes the shortcut hint while the textarea is focused', async () => {
    const { user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    expect(screen.queryByText(/Enter 换行/)).not.toBeInTheDocument()
    expect(textarea).not.toHaveAttribute('aria-describedby')
    await user.click(textarea)
    expect(screen.getByText(/Enter 换行/)).toBeInTheDocument()
    expect(textarea).toHaveAttribute('aria-describedby', 'assistant-composer-hint')
    fireEvent.blur(textarea)
    expect(screen.queryByText(/Enter 换行/)).not.toBeInTheDocument()
    expect(textarea).not.toHaveAttribute('aria-describedby')
  })

  it('switches models before the first message and persists later conversation switches', async () => {
    const secondProfile = profileWithModel('anthropic', 'second-model', { id: 'second-profile', displayName: '备用模型', hasApiKey: true })
    const firstResponse = deferred<{ text: string; toolCalls: [] }>()
    const { complete, onNavigateConversation, profile, rerenderConversation, user } = setup({}, [secondProfile])
    complete.mockImplementationOnce(() => firstResponse.promise)
    const picker = screen.getByLabelText('模型服务')

    await user.selectOptions(picker, modelTarget(secondProfile))
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '棉悠悠资料')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(onNavigateConversation).toHaveBeenCalledOnce())
    const conversationId = onNavigateConversation.mock.calls[0]?.[0]
    expect(conversationId).toEqual(expect.any(String))
    rerenderConversation(conversationId)
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
    expect(complete.mock.calls[0]?.[0].id).toBe(secondProfile.id)
    act(() => firstResponse.resolve({ text: '本地证据回答。', toolCalls: [] }))
    await screen.findByText('本地证据回答。')
    await waitFor(() => expect(picker).not.toBeDisabled())
    await waitFor(async () => expect((await new AgentRepository().loadConversation(conversationId))?.conversation.profileId).toBe(secondProfile.id))

    await user.selectOptions(picker, modelTarget(profile))
    await waitFor(() => expect(picker).toHaveValue(modelTarget(profile)))
    await waitFor(async () => expect((await new AgentRepository().loadConversation(conversationId))?.conversation.profileId).toBe(profile.id))
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '再查一次棉悠悠')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(complete.mock.calls[1]?.[0].id).toBe(profile.id)
  })

  it('groups models by connection and persists an exact model selection', async () => {
    const base = profileWithModel('openai', 'model-a', { id: 'shared-connection', displayName: '共享 OpenAI' })
    const profile = {
      ...base,
      models: [
        { ...base.models[0], modelId: 'model-a', label: 'Model A', enabled: true },
        { ...base.models[0], modelId: 'model-b', label: 'Model B', enabled: true, contextTurns: 3 },
      ],
    }
    const repository = new AgentRepository()
    const conversation = await repository.createConversation(profile.id, 'model-a')
    const { complete, user } = setup(profile, [], conversation.id)
    const picker = await screen.findByLabelText('模型服务')

    expect(within(picker).getByRole('group', { name: '共享 OpenAI' })).toBeInTheDocument()
    await waitFor(() => expect(picker).toHaveValue(modelTarget(profile, 'model-a')))
    await waitFor(() => expect(picker).not.toBeDisabled())
    await user.selectOptions(picker, modelTarget(profile, 'model-b'))
    await waitFor(async () => expect((await repository.loadConversation(conversation.id))?.conversation).toMatchObject({
      profileId: profile.id,
      modelId: 'model-b',
    }))
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '查询棉悠悠')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())
    expect(complete.mock.calls[0]?.[1].modelId).toBe('model-b')
  })

  it('keeps a hidden historical model selected while default changes only affect new conversations', async () => {
    const base = profileWithModel('openai', 'new-default', { id: 'hidden-connection', displayName: '历史连接' })
    const profile = {
      ...base,
      models: [
        { ...base.models[0], modelId: 'new-default', label: '新默认', enabled: true },
        { ...base.models[0], modelId: 'old-hidden', label: '旧模型', enabled: false },
      ],
    }
    const repository = new AgentRepository()
    const conversation = await repository.createConversation(profile.id, 'old-hidden')
    const { rerenderConversation } = setup(profile, [], conversation.id)
    const picker = await screen.findByLabelText('模型服务')

    await waitFor(() => expect(picker).toHaveValue(modelTarget(profile, 'old-hidden')))
    expect(within(picker).getByRole('option', { name: /旧模型.*已隐藏/ })).toBeInTheDocument()
    rerenderConversation(conversation.id)
    expect(picker).toHaveValue(modelTarget(profile, 'old-hidden'))
    expect((await repository.loadConversation(conversation.id))?.conversation.modelId).toBe('old-hidden')
  })

  it('keeps sending disabled until the routed conversation loads and ignores out-of-order loads', async () => {
    const profileId = 'route-profile'
    const conversationA = conversationBundle('conversation-a', 'A 记录内容', profileId)
    const conversationB = conversationBundle('conversation-b', 'B 记录内容', profileId)
    const loadA = deferred<AgentConversationBundle | null>()
    const loadB = deferred<AgentConversationBundle | null>()
    const loadConversation = vi.spyOn(AgentRepository.prototype, 'loadConversation').mockImplementation((id) => {
      if (id === conversationA.conversation.id) return loadA.promise
      if (id === conversationB.conversation.id) return loadB.promise
      return Promise.resolve(null)
    })
    const { complete, rerenderConversation, user } = setup({ id: profileId }, [], conversationA.conversation.id)

    await waitFor(() => expect(loadConversation).toHaveBeenCalledWith(conversationA.conversation.id))
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '加载时不能发送')
    expect(screen.getByLabelText('模型服务')).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    fireEvent.keyDown(screen.getByLabelText('向帕鲁助手提问'), { key: 'Enter', ctrlKey: true })
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('研究记录仍在加载')

    rerenderConversation(conversationB.conversation.id)
    await waitFor(() => expect(loadConversation).toHaveBeenCalledWith(conversationB.conversation.id))
    act(() => loadB.resolve(conversationB))
    expect(await screen.findByText('B 记录内容')).toBeInTheDocument()
    expect(screen.queryByText('A 记录内容')).not.toBeInTheDocument()

    act(() => loadA.resolve(conversationA))
    await waitFor(() => expect(screen.queryByText('A 记录内容')).not.toBeInTheDocument())
    expect(screen.getByText('B 记录内容')).toBeInTheDocument()
  })

  it('turns a missing conversation route into an actionable not-found state', async () => {
    setup({}, [], 'missing-conversation')

    expect(await screen.findByRole('heading', { name: '这条研究记录不存在' })).toBeInTheDocument()
    expect(screen.getByText(/链接来自另一台设备/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回新对话' })).toHaveAttribute('href', '#/assistant')
    expect(document.querySelector('.assistant-messages')).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByLabelText('模型服务')).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: '从一条可核对的问题开始' })).not.toBeInTheDocument()
  })

  it('keeps history read-only until a missing model profile is explicitly rebound', async () => {
    const availableProfileId = 'available-profile'
    const repository = new AgentRepository()
    const conversation = await repository.createConversation('deleted-profile')
    const createdAt = new Date().toISOString()
    await repository.appendMessage({ id: 'missing-profile-user', conversationId: conversation.id, role: 'user', content: '保留的历史问题', status: 'complete', createdAt })
    await repository.appendMessage({ id: 'missing-profile-answer', conversationId: conversation.id, role: 'assistant', content: '保留的历史回答', status: 'complete', createdAt, providerName: '已删除模型', model: 'deleted-model' })
    const { complete, profile: availableProfile, user } = setup({ id: availableProfileId }, [], conversation.id)

    expect(await screen.findByText('保留的历史回答')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('原模型服务或型号已删除')
    expect(screen.getByLabelText('模型服务')).toHaveValue('')
    expect(screen.getByRole('button', { name: '重新生成' })).toBeDisabled()
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '棉悠悠资料')
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    fireEvent.keyDown(screen.getByLabelText('向帕鲁助手提问'), { key: 'Enter', ctrlKey: true })
    expect(complete).not.toHaveBeenCalled()

    await user.selectOptions(screen.getByLabelText('模型服务'), modelTarget(availableProfile))
    await waitFor(() => expect(screen.getByLabelText('模型服务')).toHaveValue(modelTarget(availableProfile)))
    await waitFor(async () => expect((await repository.loadConversation(conversation.id))?.conversation.profileId).toBe(availableProfileId))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())
    expect(complete.mock.calls[0]?.[0].id).toBe(availableProfileId)
  })

  it('rolls back a failed persisted model switch and reenables sending', async () => {
    const primaryProfileId = 'primary-profile'
    const secondProfile = profileWithModel('anthropic', 'second-model', { id: 'second-profile', displayName: '备用模型', hasApiKey: true })
    const repository = new AgentRepository()
    const conversation = await repository.createConversation(primaryProfileId)
    const saveProfile = deferred<void>()
    vi.spyOn(AgentRepository.prototype, 'setConversationTarget').mockImplementationOnce(() => saveProfile.promise)
    const { user } = setup({ id: primaryProfileId }, [secondProfile], conversation.id)
    const picker = screen.getByLabelText('模型服务')
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await waitFor(() => expect(picker).toHaveValue(modelTarget(profileWithModel('openai', 'test-model', { id: primaryProfileId }))))
    await waitFor(() => expect(picker).not.toBeDisabled())
    await user.type(textarea, '切换后发送')
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
    await user.selectOptions(picker, modelTarget(secondProfile))
    expect(picker).toBeDisabled()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()

    act(() => saveProfile.reject(new Error('无法写入 IndexedDB')))
    expect(await screen.findByRole('alert')).toHaveTextContent('模型切换失败，已恢复原模型')
    expect(screen.getByRole('alert')).toHaveTextContent('请重试')
    await waitFor(() => expect(picker).toHaveValue(modelTarget(profileWithModel('openai', 'test-model', { id: primaryProfileId }))))
    expect(picker).not.toBeDisabled()
    expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
    expect((await repository.loadConversation(conversation.id))?.conversation.profileId).toBe(primaryProfileId)
  })

  it.each(['conversation navigation', 'removal of the last profile'])('aborts generation on %s and ignores the old completion', async (reason) => {
    const profileId = 'navigation-profile'
    const repository = new AgentRepository()
    const conversationA = await repository.createConversation(profileId)
    const conversationB = await repository.createConversation(profileId)
    const createdAt = new Date().toISOString()
    await repository.appendMessage({ id: 'route-a-message', conversationId: conversationA.id, role: 'user', content: 'A 原有内容', status: 'complete', createdAt })
    await repository.appendMessage({ id: 'route-b-message', conversationId: conversationB.id, role: 'user', content: 'B 当前内容', status: 'complete', createdAt })
    const completion = deferred<{ text: string; toolCalls: [] }>()
    const { complete, controller, rerenderConversation, user } = setup({ id: profileId }, [], conversationA.id)
    let requestSignal: AbortSignal | undefined
    complete.mockImplementationOnce((_profile, _request, signal) => {
      requestSignal = signal
      return completion.promise
    })

    expect(await screen.findByText('A 原有内容')).toBeInTheDocument()
    await user.type(screen.getByLabelText('向帕鲁助手提问'), '棉悠悠资料')
    await user.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())

    if (reason === 'removal of the last profile') {
      controller.snapshot = emptySnapshot
      rerenderConversation(conversationA.id)
      expect(screen.getByRole('heading', { name: '先配置模型服务' })).toBeInTheDocument()
      expect(requestSignal?.aborted).toBe(true)
      await act(async () => completion.resolve({ text: '不应写回的 A 回答', toolCalls: [] }))
      expect((await repository.loadConversation(conversationA.id))?.messages.some((message) => message.role === 'assistant')).toBe(false)
      return
    }
    rerenderConversation(conversationB.id)
    const dialogue = screen.getByLabelText('帕鲁助手对话')
    expect(await within(dialogue).findByText('B 当前内容')).toBeInTheDocument()
    await waitFor(() => expect(requestSignal?.aborted).toBe(true))
    act(() => completion.resolve({ text: '不应写回的 A 回答', toolCalls: [] }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument())

    expect(within(dialogue).queryByText('A 原有内容')).not.toBeInTheDocument()
    expect(within(dialogue).queryByText('不应写回的 A 回答')).not.toBeInTheDocument()
    expect(within(dialogue).getByText('B 当前内容')).toBeInTheDocument()
    expect((await repository.loadConversation(conversationA.id))?.messages.some((message) => message.role === 'assistant')).toBe(false)
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

  it('selects pal entities with @, derives comparison, and preserves only object chips for regeneration', async () => {
    const { complete, user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await user.type(textarea, '@mianyouyou')
    const firstOption = within(screen.getByRole('listbox')).getByRole('option', { name: /棉悠悠/ })
    expect(firstOption).toHaveAttribute('data-mention-kind', 'pal')
    expect(firstOption.querySelector('img')).toHaveAttribute('src', '/generated/pals/Lamball.webp')
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
    const historyReferences = within(screen.getByLabelText('消息使用的本地引用'))
    expect(historyReferences.getByText('棉悠悠')).toBeInTheDocument()
    expect(historyReferences.getByText('捣蛋猫')).toBeInTheDocument()
    expect(historyReferences.queryByText('帕鲁对比')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(2))
    expect(JSON.stringify(complete.mock.calls[1]?.[1])).toContain('compare_pals')
  })

  it('keeps the draft and chips editable when a breeding question references more than two pals', async () => {
    const { complete, user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')
    const selectPal = async (query: string, label: string) => {
      await user.type(textarea, `@${query}`)
      await user.click(within(screen.getByRole('listbox')).getByRole('option', { name: new RegExp(label) }))
    }

    await selectPal('mianyouyou', '棉悠悠')
    await selectPal('daodanmao', '捣蛋猫')
    await selectPal('meimo', '寐魔')
    await user.type(textarea, '能配什么？')

    expect(await screen.findByText('双亲查询只能使用 2 只帕鲁，请移除多余引用后再试。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

    expect(textarea).toHaveValue('能配什么？')
    expect(screen.getByRole('button', { name: '移除棉悠悠' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除捣蛋猫' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '移除寐魔' })).toBeInTheDocument()
    expect(complete).not.toHaveBeenCalled()
    expect(await new AgentRepository().listConversations()).toEqual([])
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
    const skillOption = within(screen.getByRole('listbox')).getByRole('option', { name: /火球/ })
    expect(skillOption).toHaveAttribute('tabindex', '-1')
    expect(skillOption).toHaveAttribute('data-mention-kind', 'skill')
    expect(skillOption).toHaveTextContent('默认查询可学习帕鲁')
    expect(skillOption.querySelector('.assistant-mention-kind--skill')).toHaveTextContent('SKL')
    expect(textarea).toHaveAttribute('aria-controls', 'assistant-mention-listbox')
    expect(screen.getByRole('button', { name: '添加资料' })).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(textarea).toHaveFocus()

    await user.clear(textarea)
    await user.type(textarea, '@yangmao')
    const itemOption = within(screen.getByRole('listbox')).getByRole('option', { name: /羊毛/ })
    expect(itemOption).toHaveAttribute('data-mention-kind', 'item')
    expect(itemOption).toHaveTextContent('默认查询掉落来源')
    expect(itemOption.querySelector('img')).toHaveAttribute('src', '/generated/items/Wool.webp')
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

  it('renders and regenerates historical tool mentions without exposing them in the picker', async () => {
    const profileId = 'legacy-profile'
    const repository = new AgentRepository()
    const conversation = await repository.createConversation(profileId)
    const createdAt = new Date().toISOString()
    await repository.appendMessage({
      id: 'legacy-user',
      conversationId: conversation.id,
      role: 'user',
      content: '读取这只帕鲁',
      mentions: [
        { kind: 'tool', name: 'get_pal_profile', label: '帕鲁资料', arguments: { pal: 'SheepBall' } },
        { kind: 'entity', entityType: 'pal', id: 'SheepBall', label: '棉悠悠' },
      ],
      status: 'complete',
      createdAt,
    })
    await repository.appendMessage({ id: 'legacy-answer', conversationId: conversation.id, role: 'assistant', content: '旧回答', status: 'complete', createdAt, providerName: '旧模型', model: 'test-model' })
    const { complete, user } = setup({ id: profileId }, [], conversation.id)

    expect(await screen.findByText('旧回答')).toBeInTheDocument()
    expect(within(screen.getByLabelText('消息使用的本地引用')).getByText('帕鲁资料')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '重新生成' }))
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())
    expect(JSON.stringify(complete.mock.calls[0]?.[1])).toContain('get_pal_profile')
  })

  it('keeps tools out of the new @ menu', async () => {
    const { user } = setup()
    const textarea = screen.getByLabelText('向帕鲁助手提问')

    await user.type(textarea, '@duibi')
    expect(screen.getByRole('listbox', { name: '帕鲁、技能与物品建议' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /帕鲁对比/ })).not.toBeInTheDocument()
    expect(screen.queryByText('本地工具')).not.toBeInTheDocument()
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
