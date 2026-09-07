import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderProfile } from '../../domain/agent'
import { bindAssistantToolMentions, runPalAgent } from '../../domain/agent-runner'
import type { AssistantMentionV1, KnowledgeEvidence, LocalToolTrace } from '../../domain/knowledge-contract'
import type { LocalKnowledgeService } from '../../domain/knowledge'
import type { AgentModelMessage } from '../../domain/provider-adapters'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { AgentRepository, type AgentConversation, type AgentConversationBundle, type AgentMessage } from '../../storage/agent-storage'
import { mentionCategoryLabel } from './AssistantMentions'
import type { AssistantComposerController } from './useAssistantComposer'

const EMPTY_EVIDENCE: KnowledgeEvidence[] = []
const EMPTY_TRACES: LocalToolTrace[] = []

interface AssistantConversationOptions {
  conversationId?: string
  providerController: ProviderProfilesController
  onNavigateConversation: (conversationId?: string) => void
  onConversationCreated: () => void
  knowledge: LocalKnowledgeService
  composer: Pick<AssistantComposerController, 'draft' | 'mentions' | 'composerContentRef' | 'setDraft' | 'setMentions' | 'setMentionOpen' | 'setComposerError' | 'composerRef'>
}

// This hook alone owns repository lifetime and archive/load/run/profile-save generations.
export function useAssistantConversation({ conversationId, providerController, onNavigateConversation, onConversationCreated, knowledge, composer }: AssistantConversationOptions) {
  const { draft, mentions, composerContentRef, setDraft, setMentions, setMentionOpen, setComposerError, composerRef } = composer
  const repositoryRef = useRef<AgentRepository | null>(null)
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [bundle, setBundle] = useState<AgentConversationBundle | null>(null)
  const [draftProfileId, setDraftProfileId] = useState(providerController.snapshot.defaultProfileId)
  const [draftModelId, setDraftModelId] = useState(() => providerController.snapshot.profiles.find((profile) => profile.id === providerController.snapshot.defaultProfileId)?.defaultModelId ?? '')
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [missingConversationId, setMissingConversationId] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const archiveLoadGenerationRef = useRef(0)
  const loadGenerationRef = useRef(0)
  const runGenerationRef = useRef(0)
  const runConversationIdRef = useRef<string | undefined>(undefined)
  const profileSaveGenerationRef = useRef(0)
  const profileSavingRef = useRef(false)
  const createdConversationIdRef = useRef<string | undefined>(undefined)
  const routeConversationIdRef = useRef(conversationId)
  const defaultProfileIdRef = useRef(providerController.snapshot.defaultProfileId)
  routeConversationIdRef.current = conversationId
  defaultProfileIdRef.current = providerController.snapshot.defaultProfileId

  const refreshConversations = useCallback(async (repository = repositoryRef.current) => {
    if (!repository || repositoryRef.current !== repository) return
    const generation = ++archiveLoadGenerationRef.current
    try {
      const next = await repository.listConversations()
      if (repositoryRef.current === repository && archiveLoadGenerationRef.current === generation) setConversations(next)
    } catch (cause) {
      if (repositoryRef.current === repository && archiveLoadGenerationRef.current === generation) throw cause
    }
  }, [])
  useEffect(() => {
    const repository = new AgentRepository()
    repositoryRef.current = repository
    void refreshConversations(repository).catch((cause) => {
      if (repositoryRef.current === repository) setError(cause instanceof Error ? cause.message : '对话加载失败')
    })
    return () => {
      repositoryRef.current = null
      ++archiveLoadGenerationRef.current
      ++loadGenerationRef.current
      ++profileSaveGenerationRef.current
      ++runGenerationRef.current
      profileSavingRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
      runConversationIdRef.current = undefined
      repository.close()
    }
  }, [])
  useEffect(() => {
    const repository = repositoryRef.current
    if (!repository) return
    const loadGeneration = ++loadGenerationRef.current
    ++profileSaveGenerationRef.current
    profileSavingRef.current = false
    setProfileSaving(false)
    setError('')

    if (abortRef.current && runConversationIdRef.current !== conversationId) {
      ++runGenerationRef.current
      abortRef.current.abort()
      abortRef.current = null
      runConversationIdRef.current = undefined
      setBusy(false)
      setStatus('')
      setStreamedText('')
    }

    if (!conversationId) {
      createdConversationIdRef.current = undefined
      setBundle(null)
      setLoadedConversationId(null)
      setMissingConversationId(null)
      setSelectedMessageId('')
      return
    }
    createdConversationIdRef.current = undefined
    setBundle(null)
    setLoadedConversationId(null)
    setMissingConversationId(null)
    setSelectedMessageId('')
    void repository.loadConversation(conversationId).then((next) => {
      if (loadGenerationRef.current !== loadGeneration || routeConversationIdRef.current !== conversationId) return
      if (!next) {
        setBundle(null)
        setLoadedConversationId(conversationId)
        setMissingConversationId(conversationId)
        setDraftProfileId(defaultProfileIdRef.current)
        return
      }
      setBundle(next)
      setLoadedConversationId(conversationId)
      setMissingConversationId(null)
      const profile = providerController.snapshot.profiles.find((candidate) => candidate.id === next.conversation.profileId)
      const inferredModelId = next.conversation.modelId
        || [...next.messages].reverse().find((message) => message.role === 'assistant' && message.model)?.model
        || profile?.defaultModelId
        || ''
      setDraftProfileId(next.conversation.profileId)
      setDraftModelId(inferredModelId)
      setSelectedMessageId([...next.messages].reverse().find((message) => message.role === 'assistant')?.id ?? '')
    }).catch((cause) => {
      if (loadGenerationRef.current !== loadGeneration || routeConversationIdRef.current !== conversationId) return
      setLoadedConversationId(conversationId)
      setError(cause instanceof Error ? cause.message : '对话加载失败')
    })
  }, [conversationId, providerController.snapshot.profiles])

  const visibleBundle = conversationId
    ? loadedConversationId === conversationId && bundle?.conversation.id === conversationId ? bundle : null
    : createdConversationIdRef.current && bundle?.conversation.id === createdConversationIdRef.current ? bundle : null
  const conversationLoading = Boolean(conversationId && loadedConversationId !== conversationId)
  const conversationNotFound = Boolean(conversationId && missingConversationId === conversationId)
  const conversationReady = !conversationId || Boolean(visibleBundle)
  const profiles = providerController.snapshot.profiles
  const conversationProfile = visibleBundle
    ? profiles.find((profile) => profile.id === visibleBundle.conversation.profileId)
    : undefined
  const conversationModelId = visibleBundle?.conversation.modelId
    || [...(visibleBundle?.messages ?? [])].reverse().find((message) => message.role === 'assistant' && message.model)?.model
    || conversationProfile?.defaultModelId
    || ''
  const conversationModel = conversationProfile?.models.find((model) => model.modelId === conversationModelId)
  const conversationProfileUnavailable = Boolean(visibleBundle && !providerController.loading && (!conversationProfile || !conversationModel))
  const selectedDraftProfile = profiles.find((profile) => profile.id === draftProfileId)
  const selectedDraftModel = selectedDraftProfile?.models.find((model) => model.modelId === draftModelId)
  const draftDiffersFromConversation = Boolean(visibleBundle && (draftProfileId !== visibleBundle.conversation.profileId || draftModelId !== conversationModelId))
  const activeProfile = conversationProfileUnavailable
    ? draftDiffersFromConversation && selectedDraftModel ? selectedDraftProfile : undefined
    : selectedDraftProfile
      ?? conversationProfile
      ?? profiles.find((profile) => profile.id === providerController.snapshot.defaultProfileId)
      ?? profiles[0]
  const activeModelId = activeProfile?.id === draftProfileId && selectedDraftModel
    ? selectedDraftModel.modelId
    : activeProfile?.id === conversationProfile?.id && conversationModel
      ? conversationModel.modelId
      : activeProfile?.defaultModelId ?? ''
  const activeModel = activeProfile?.models.find((model) => model.modelId === activeModelId)
  const selectedEvidence = visibleBundle?.evidenceByMessage[selectedMessageId] ?? EMPTY_EVIDENCE
  const selectedTraces = visibleBundle?.tracesByMessage[selectedMessageId] ?? EMPTY_TRACES

  const createConversation = async () => {
    const repository = repositoryRef.current
    if (!repository) return
    const defaultProfile = activeProfile ?? profiles.find((profile) => profile.id === providerController.snapshot.defaultProfileId) ?? profiles[0]
    try {
      const conversation = await repository.createConversation(defaultProfile?.id ?? '', activeModelId || defaultProfile?.defaultModelId || '')
      await refreshConversations(repository)
      if (repositoryRef.current !== repository) return
      onConversationCreated()
      onNavigateConversation(conversation.id)
      requestAnimationFrame(() => composerRef.current?.focus())
      return conversation
    } catch (cause) {
      if (repositoryRef.current === repository) setError(cause instanceof Error ? cause.message : '研究记录创建失败，请重试。')
    }
  }

  const send = async (question = draft.trim(), requestedMentions = mentions) => {
    const repository = repositoryRef.current
    if (!repository) return
    if (busy || abortRef.current || profileSavingRef.current || (!question && requestedMentions.length === 0)) return
    if (conversationNotFound) { setError('这条研究记录不存在或已被删除。请返回新对话后再发送。'); return }
    if (!conversationReady) { setError('研究记录仍在加载，请稍候再发送。'); return }
    if (conversationProfileUnavailable) { setError('原模型配置已删除或不可用。请先选择一个现有模型服务并保存到这条记录。'); return }
    if (!activeProfile || !activeModel) { setError('请先选择可用的模型。'); return }
    let boundMentions: AssistantMentionV1[]
    try {
      boundMentions = bindAssistantToolMentions(question, requestedMentions).mentions
    } catch (cause) {
      setComposerError(cause instanceof Error ? cause.message : '请补全本地工具需要的引用。')
      requestAnimationFrame(() => composerRef.current?.focus())
      return
    }
    const consentKey = providerConsentKey(activeProfile)
    if (!localStorage.getItem(consentKey)) {
      const accepted = window.confirm(`发送后，当前问题、必要对话上下文和本地检索片段会传给“${activeProfile.displayName}”。继续吗？`)
      if (!accepted) return
      localStorage.setItem(consentKey, 'accepted')
    }
    setBusy(true)
    setDraft('')
    setMentions([])
    composerContentRef.current = { draft: '', mentions: [] }
    setMentionOpen(false)
    setComposerError('')
    setError('')
    setStatus('正在检索本地知识')
    setStreamedText('')
    const controller = new AbortController()
    abortRef.current = controller
    const runGeneration = ++runGenerationRef.current
    const startedWithoutConversation = !conversationId
    const startedRouteConversationId = conversationId
    let targetConversationId = visibleBundle?.conversation.id
    let userMessageSaved = false
    runConversationIdRef.current = targetConversationId
    const isStartCurrent = () => runGenerationRef.current === runGeneration && routeConversationIdRef.current === startedRouteConversationId
    const isRunCurrent = () => runGenerationRef.current === runGeneration
      && Boolean(targetConversationId)
      && (routeConversationIdRef.current === targetConversationId || (startedWithoutConversation && routeConversationIdRef.current === undefined))
    try {
      let conversation = visibleBundle?.conversation
      if (!conversation) {
        conversation = await repository.createConversation(activeProfile.id, activeModelId)
        if (!isStartCurrent()) return
        targetConversationId = conversation.id
        runConversationIdRef.current = conversation.id
        createdConversationIdRef.current = conversation.id
        await refreshConversations(repository)
        if (!isRunCurrent()) return
        onConversationCreated()
        onNavigateConversation(conversation.id)
        requestAnimationFrame(() => composerRef.current?.focus())
      }
      if (!isRunCurrent()) return
      const userMessage: AgentMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: 'user', content: question, mentions: boundMentions, status: 'complete', createdAt: new Date().toISOString() }
      await repository.appendMessage(userMessage)
      userMessageSaved = true
      if (!isRunCurrent()) return
      ++loadGenerationRef.current
      const current = await repository.loadConversation(conversation.id)
      if (!isRunCurrent()) return
      setBundle(current)
      setLoadedConversationId(conversation.id)
      if (!conversation.modelId) await repository.setConversationTarget(conversation.id, activeProfile.id, activeModelId)
      const history: AgentModelMessage[] = (current?.messages ?? [])
        .slice(-(activeModel.contextTurns * 2 + 1), -1)
        .map((message) => ({ role: message.role, content: messageContentForModel(message) }))
      const result = await runPalAgent({
        question,
        mentions: boundMentions,
        history,
        profile: activeProfile,
        modelId: activeModelId,
        knowledge,
        signal: controller.signal,
        complete: (request) => providerController.service.complete(activeProfile, request, controller.signal, (event) => { if (event.type === 'text-delta' && isRunCurrent()) setStreamedText((currentText) => currentText + event.text) }),
        onStatus: (nextStatus) => { if (isRunCurrent()) setStatus(nextStatus) },
      })
      if (!isRunCurrent()) return
      const assistantMessage: AgentMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: 'assistant', content: result.text, status: 'complete', createdAt: new Date().toISOString(), providerName: activeProfile.displayName, model: activeModelId, usage: result.usage }
      await repository.appendMessage(assistantMessage, result.evidence, result.traces)
      if (!isRunCurrent()) return
      ++loadGenerationRef.current
      const nextBundle = await repository.loadConversation(conversation.id)
      if (!isRunCurrent()) return
      setBundle(nextBundle)
      setLoadedConversationId(conversation.id)
      setSelectedMessageId(assistantMessage.id)
      await refreshConversations(repository)
    } catch (cause) {
      if (targetConversationId ? !isRunCurrent() : !isStartCurrent()) return
      const message = cause instanceof Error ? cause.message : '查询失败'
      setError(message)
      if (!userMessageSaved && !composerContentRef.current.draft && composerContentRef.current.mentions.length === 0) {
        setDraft(question)
        setMentions(boundMentions)
      }
      if (targetConversationId) {
        try {
          await repository.appendMessage({ id: crypto.randomUUID(), conversationId: targetConversationId, role: 'assistant', content: message, status: 'error', createdAt: new Date().toISOString(), providerName: activeProfile.displayName, model: activeModelId })
          if (!isRunCurrent()) return
          ++loadGenerationRef.current
          const nextBundle = await repository.loadConversation(targetConversationId)
          if (!isRunCurrent()) return
          setBundle(nextBundle)
          setLoadedConversationId(targetConversationId)
          await refreshConversations(repository)
        } catch {
          if (isRunCurrent()) setError(`${message}。本地记录暂时无法保存或读取，请重试。`)
        }
      }
    } finally {
      if (runGenerationRef.current === runGeneration) {
        setBusy(false)
        setStatus('')
        setStreamedText('')
        if (abortRef.current === controller) abortRef.current = null
        runConversationIdRef.current = undefined
      }
    }
  }

  const stop = () => { abortRef.current?.abort(); setStatus('正在停止') }
  const switchProfile = async (target: string) => {
    const repository = repositoryRef.current
    if (!repository) return
    const { profileId, modelId } = parseModelTarget(target)
    const nextProfile = profiles.find((profile) => profile.id === profileId)
    if (busy || profileSavingRef.current || !nextProfile?.models.some((model) => model.modelId === modelId)) return
    if (!conversationReady) { setError('研究记录仍在加载，请稍候再切换模型。'); return }
    const previousProfileId = activeProfile?.id ?? draftProfileId
    const previousModelId = activeModelId || draftModelId
    setDraftProfileId(profileId)
    setDraftModelId(modelId)
    if (!visibleBundle || (profileId === visibleBundle.conversation.profileId && modelId === conversationModelId)) return
    const targetConversationId = visibleBundle.conversation.id
    const startedWithoutConversation = !conversationId
    const saveGeneration = ++profileSaveGenerationRef.current
    profileSavingRef.current = true
    setProfileSaving(true)
    setError('')
    const isSaveCurrent = () => profileSaveGenerationRef.current === saveGeneration
      && (routeConversationIdRef.current === targetConversationId
        || (startedWithoutConversation && routeConversationIdRef.current === undefined && createdConversationIdRef.current === targetConversationId))
    let saved = false
    try {
      await repository.setConversationTarget(targetConversationId, profileId, modelId)
      saved = true
      if (!isSaveCurrent()) return
      const loadGeneration = ++loadGenerationRef.current
      const nextBundle = await repository.loadConversation(targetConversationId)
      if (!isSaveCurrent() || loadGenerationRef.current !== loadGeneration) return
      setBundle(nextBundle)
      setLoadedConversationId(targetConversationId)
    } catch (cause) {
      if (!isSaveCurrent()) return
      if (!saved) { setDraftProfileId(previousProfileId); setDraftModelId(previousModelId) }
      const detail = cause instanceof Error ? cause.message : '本地存储不可用'
      setError(saved
        ? `模型已保存，但研究记录刷新失败：${detail}。请重新打开这条记录。`
        : `模型切换失败，已恢复原模型：${detail}。请重试；若仍失败，请检查本地存储权限。`)
    } finally {
      if (profileSaveGenerationRef.current === saveGeneration) {
        profileSavingRef.current = false
        setProfileSaving(false)
      }
    }
  }
  const renameConversation = useCallback(async (conversation: AgentConversation) => {
    const repository = repositoryRef.current
    if (!repository) return
    const title = window.prompt('重命名研究记录', conversation.title)
    if (title === null) return
    try {
      await repository.renameConversation(conversation.id, title)
      await refreshConversations(repository)
      if (repositoryRef.current !== repository) return
      if (conversation.id === routeConversationIdRef.current) {
        const loadGeneration = ++loadGenerationRef.current
        const nextBundle = await repository.loadConversation(conversation.id)
        if (loadGenerationRef.current === loadGeneration && routeConversationIdRef.current === conversation.id) {
          setBundle(nextBundle)
          setLoadedConversationId(conversation.id)
        }
      }
    }
    catch (cause) { if (repositoryRef.current === repository) setError(cause instanceof Error ? cause.message : '重命名失败') }
  }, [refreshConversations])
  const deleteConversation = useCallback(async (conversation: AgentConversation) => {
    const repository = repositoryRef.current
    if (!repository) return
    if (!window.confirm(`删除研究记录“${conversation.title}”？`)) return
    try {
      await repository.deleteConversation(conversation.id)
      await refreshConversations(repository)
      if (repositoryRef.current === repository && conversation.id === routeConversationIdRef.current) onNavigateConversation()
    } catch (cause) {
      if (repositoryRef.current === repository) setError(cause instanceof Error ? cause.message : '研究记录删除失败，请重试。')
    }
  }, [onNavigateConversation, refreshConversations])
  const clearAll = async () => {
    const repository = repositoryRef.current
    if (!repository) return
    if (!window.confirm('清空全部研究记录？此操作无法撤销。')) return
    try {
      await repository.clear()
      if (repositoryRef.current !== repository) return
      ++archiveLoadGenerationRef.current
      setConversations([])
      setBundle(null)
      setLoadedConversationId(null)
      createdConversationIdRef.current = undefined
      onNavigateConversation()
    } catch (cause) {
      if (repositoryRef.current === repository) setError(cause instanceof Error ? cause.message : '研究记录清空失败，请重试。')
    }
  }

  const lastUserMessage = useMemo(() => [...(visibleBundle?.messages ?? [])].reverse().find((message) => message.role === 'user'), [visibleBundle])


  return { conversations, visibleBundle, conversationLoading, conversationNotFound, conversationReady, conversationProfile, conversationModelId, conversationProfileUnavailable, profiles, activeProfile, activeModelId, activeModel, profileSaving, busy, status, streamedText, error, selectedEvidence, selectedTraces, setSelectedMessageId, lastUserMessage, createConversation, send, stop, switchProfile, renameConversation, deleteConversation, clearAll }
}

function messageContentForModel(message: AgentMessage): string {
  if (!message.mentions?.length) return message.content
  const references = message.mentions.map((mention) => mention.kind === 'tool' ? `@${mention.label}` : `${mentionCategoryLabel(mention.entityType)}:${mention.label}`).join('、')
  return `${message.content}${message.content ? '\n' : ''}本地引用：${references}`
}

function providerConsentKey(profile: ProviderProfile): string {
  let endpoint = profile.baseUrl.trim()
  try { endpoint = new URL(endpoint).href.replace(/\/+$/u, '') }
  catch { /* Invalid URLs are rejected by the provider boundary before a request. */ }
  return `paltools.agent-consent.v1:${profile.id}:${profile.transport}:${encodeURIComponent(endpoint)}`
}

function parseModelTarget(value: string): { profileId: string; modelId: string } {
  const [profileId = '', modelId = ''] = value.split('|', 2)
  return { profileId: decodeURIComponent(profileId), modelId: decodeURIComponent(modelId) }
}


export type AssistantConversationController = ReturnType<typeof useAssistantConversation>
