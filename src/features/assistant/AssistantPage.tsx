import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AssistantIcon, DeleteIcon, EditIcon, EvidenceIcon, NewRecordIcon, SendIcon, StopIcon } from '../../components/ui-icons'
import type { ProviderProfileV1 } from '../../domain/agent'
import { bindAssistantToolMentions, runPalAgent } from '../../domain/agent-runner'
import {
  type AssistantEntityMentionV1,
  type AssistantMentionV1,
  type KnowledgeEvidence,
} from '../../domain/knowledge-contract'
import { LocalKnowledgeService } from '../../domain/knowledge'
import type { AgentModelMessage } from '../../domain/provider-adapters'
import type { ActiveSkillRecord, BreedingIndexPayload, ItemRecord, PalRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { formatAppRouteHash } from '../../lib/app-route'
import { localAssetUrl } from '../../lib/assets'
import { AgentRepository, type AgentConversation, type AgentConversationBundle, type AgentMessage } from '../../storage/agent-storage'

const QUICK_QUESTIONS = ['棉悠悠适合做什么？', '怎么配出寐魔？', '比较捣蛋猫和棉悠悠', '哪些帕鲁会掉落羊毛？']
const MENTION_LIST_ID = 'assistant-mention-listbox'

type MentionCategory = AssistantEntityMentionV1['entityType']

interface MentionOption {
  key: string
  category: MentionCategory
  categoryLabel: string
  label: string
  detail: string
  imagePath?: string
  mention: AssistantEntityMentionV1
}

interface MentionTrigger {
  start: number
  end: number
  query: string
}

interface AssistantPageProps {
  pals: PalRecord[]
  skills: ActiveSkillRecord[]
  items: ItemRecord[]
  breedingIndex: BreedingIndexPayload | null
  datasetVersion: string
  conversationId?: string
  providerController: ProviderProfilesController
  onNavigateConversation: (conversationId?: string) => void
}

function useMediaQuery(query: string) {
  const readMatch = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches
  const [matches, setMatches] = useState(readMatch)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia(query)
    const update = () => setMatches(mediaQuery.matches)
    update()
    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [query])

  return matches
}

export function AssistantPage({ pals, skills, items, breedingIndex, datasetVersion, conversationId, providerController, onNavigateConversation }: AssistantPageProps) {
  const repository = useMemo(() => new AgentRepository(), [])
  const knowledge = useMemo(() => new LocalKnowledgeService({ pals, skills, items, breedingIndex, datasetVersion }), [pals, skills, items, breedingIndex, datasetVersion])
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [bundle, setBundle] = useState<AgentConversationBundle | null>(null)
  const [draft, setDraft] = useState('')
  const [mentions, setMentions] = useState<AssistantMentionV1[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [editingMention, setEditingMention] = useState<AssistantMentionV1 | null>(null)
  const [mentionPanelStyle, setMentionPanelStyle] = useState<CSSProperties>()
  const [composerError, setComposerError] = useState('')
  const [composerFocused, setComposerFocused] = useState(false)
  const [draftProfileId, setDraftProfileId] = useState(providerController.snapshot.defaultProfileId)
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [missingConversationId, setMissingConversationId] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const loadGenerationRef = useRef(0)
  const runGenerationRef = useRef(0)
  const runConversationIdRef = useRef<string | undefined>(undefined)
  const profileSaveGenerationRef = useRef(0)
  const profileSavingRef = useRef(false)
  const createdConversationIdRef = useRef<string | undefined>(undefined)
  const routeConversationIdRef = useRef(conversationId)
  const defaultProfileIdRef = useRef(providerController.snapshot.defaultProfileId)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerRootRef = useRef<HTMLDivElement>(null)
  const evidenceRef = useRef<HTMLElement>(null)
  const archiveRef = useRef<HTMLElement>(null)
  const evidenceCloseRef = useRef<HTMLButtonElement>(null)
  const archiveCloseRef = useRef<HTMLButtonElement>(null)
  const evidenceToggleRef = useRef<HTMLButtonElement>(null)
  const archiveToggleRef = useRef<HTMLButtonElement>(null)
  const evidenceOpenerRef = useRef<HTMLElement | null>(null)
  const evidenceUsesDrawer = useMediaQuery('(max-width: 1179px)')
  const archiveUsesDrawer = useMediaQuery('(max-width: 800px)')
  routeConversationIdRef.current = conversationId
  defaultProfileIdRef.current = providerController.snapshot.defaultProfileId

  const refreshConversations = async () => setConversations(await repository.listConversations())
  useEffect(() => { void refreshConversations().catch((cause) => setError(cause instanceof Error ? cause.message : '对话加载失败')) }, [repository])
  useEffect(() => {
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
      setDraftProfileId(next.conversation.profileId)
      setSelectedMessageId([...next.messages].reverse().find((message) => message.role === 'assistant')?.id ?? '')
    }).catch((cause) => {
      if (loadGenerationRef.current !== loadGeneration || routeConversationIdRef.current !== conversationId) return
      setLoadedConversationId(conversationId)
      setError(cause instanceof Error ? cause.message : '对话加载失败')
    })
  }, [conversationId, repository])
  useEffect(() => () => {
    ++loadGenerationRef.current
    ++profileSaveGenerationRef.current
    ++runGenerationRef.current
    profileSavingRef.current = false
    abortRef.current?.abort()
    abortRef.current = null
    runConversationIdRef.current = undefined
  }, [])

  useLayoutEffect(() => {
    const container = evidenceOpen && evidenceUsesDrawer
      ? evidenceRef.current
      : archiveOpen && archiveUsesDrawer
        ? archiveRef.current
        : null
    if (!container) return
    const focusable = () => [...container.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (evidenceOpen) {
          const opener = evidenceOpenerRef.current ?? evidenceToggleRef.current
          if (opener?.isConnected) opener.focus({ preventScroll: true })
          setEvidenceOpen(false)
        } else {
          if (archiveToggleRef.current?.isConnected) archiveToggleRef.current.focus({ preventScroll: true })
          setArchiveOpen(false)
        }
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    container.addEventListener('keydown', onKeyDown)
    const initialFocus = evidenceOpen ? evidenceCloseRef.current : archiveCloseRef.current
    const focusFrame = requestAnimationFrame(() => (initialFocus ?? focusable()[0])?.focus())
    return () => {
      cancelAnimationFrame(focusFrame)
      container.removeEventListener('keydown', onKeyDown)
    }
  }, [archiveOpen, archiveUsesDrawer, evidenceOpen, evidenceUsesDrawer])

  useLayoutEffect(() => {
    const active = document.activeElement
    if (!evidenceUsesDrawer && (active === evidenceToggleRef.current || evidenceRef.current?.contains(active))) composerRef.current?.focus({ preventScroll: true })
    if (!archiveUsesDrawer && (active === archiveToggleRef.current || archiveRef.current?.contains(active))) composerRef.current?.focus({ preventScroll: true })
    if (evidenceUsesDrawer && !evidenceOpen && evidenceRef.current?.contains(active)) composerRef.current?.focus({ preventScroll: true })
    if (archiveUsesDrawer && !archiveOpen && archiveRef.current?.contains(active)) composerRef.current?.focus({ preventScroll: true })
  }, [archiveOpen, archiveUsesDrawer, evidenceOpen, evidenceUsesDrawer])

  useEffect(() => {
    if (!mentionOpen) return
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (composerRootRef.current?.contains(event.target as Node)) return
      if (editingMention && mentionTrigger) setDraft((current) => `${current.slice(0, mentionTrigger.start)}${current.slice(mentionTrigger.end)}`)
      setEditingMention(null)
      setMentionOpen(false)
      setMentionQuery('')
      setMentionTrigger(null)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [editingMention, mentionOpen, mentionTrigger])

  useLayoutEffect(() => {
    if (!mentionOpen || !composerRootRef.current) return
    const updatePosition = () => {
      const rect = composerRootRef.current?.getBoundingClientRect()
      if (!rect) return
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const margin = 12
      const width = Math.max(240, Math.min(rect.width, viewportWidth - margin * 2))
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - margin - width))
      setMentionPanelStyle({ left, width, bottom: Math.max(margin, viewportHeight - rect.top + 8), maxHeight: Math.max(120, Math.min(370, rect.top - margin * 2)) })
    }
    updatePosition()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updatePosition) : null
    resizeObserver?.observe(composerRootRef.current)
    window.addEventListener('resize', updatePosition)
    return () => { resizeObserver?.disconnect(); window.removeEventListener('resize', updatePosition) }
  }, [mentionOpen])

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
  const conversationProfileUnavailable = Boolean(visibleBundle && !providerController.loading && !conversationProfile)
  const selectedDraftProfile = profiles.find((profile) => profile.id === draftProfileId)
  const activeProfile = conversationProfileUnavailable
    ? draftProfileId !== visibleBundle?.conversation.profileId ? selectedDraftProfile : undefined
    : selectedDraftProfile
      ?? conversationProfile
      ?? profiles.find((profile) => profile.id === providerController.snapshot.defaultProfileId)
      ?? profiles[0]
  const selectedEvidence = visibleBundle?.evidenceByMessage[selectedMessageId] ?? []
  const selectedTraces = visibleBundle?.tracesByMessage[selectedMessageId] ?? []

  const mentionOptions = useMemo(() => {
    const editingKey = editingMention ? mentionKey(editingMention) : ''
    const selectedKeys = new Set(mentions.filter((mention) => mentionKey(mention) !== editingKey).map(mentionKey))
    const normalizedQuery = mentionQuery.trim().toLocaleLowerCase('zh-CN')
    const evidence = normalizedQuery
      ? knowledge.search(normalizedQuery, ['pal', 'skill', 'item'], 36)
      : [
          ...pals.slice(0, 6).map((pal) => knowledge.evidenceForEntity('pal', pal.internalId)).filter(isKnowledgeEvidence),
          ...skills.slice(0, 3).map((skill) => knowledge.evidenceForEntity('skill', skill.id)).filter(isKnowledgeEvidence),
          ...items.slice(0, 3).map((item) => knowledge.evidenceForEntity('item', item.id)).filter(isKnowledgeEvidence),
        ]
    const options: MentionOption[] = []
    const entityLimits: Record<MentionCategory, number> = { pal: 6, skill: 3, item: 3 }
    const entityCounts: Record<MentionCategory, number> = { pal: 0, skill: 0, item: 0 }
    for (const item of evidence) {
      if (item.kind !== 'pal' && item.kind !== 'skill' && item.kind !== 'item') continue
      if (entityCounts[item.kind] >= entityLimits[item.kind]) continue
      const id = item.id.replace(`${item.kind}:`, '')
      const key = `entity:${item.kind}:${id}`
      if (selectedKeys.has(key)) continue
      entityCounts[item.kind] += 1
      options.push({
        key,
        category: item.kind,
        categoryLabel: mentionCategoryLabel(item.kind),
        label: item.title,
        detail: `${mentionDefaultAction(item.kind)} · ${item.summary}`,
        imagePath: item.imagePath,
        mention: { kind: 'entity', entityType: item.kind, id, label: item.title },
      })
    }
    return options
      .filter((option) => !selectedKeys.has(option.key))
      .filter((option) => !editingMention || (editingMention.kind === 'entity' && option.category === editingMention.entityType))
      .slice(0, 12)
  }, [editingMention, items, knowledge, mentionQuery, mentions, pals, skills])

  useEffect(() => { setMentionIndex((current) => Math.min(current, Math.max(0, mentionOptions.length - 1))) }, [mentionOptions.length])
  useEffect(() => {
    if (!mentionOpen || !mentionOptions[mentionIndex]) return
    document.getElementById(`assistant-mention-option-${mentionIndex}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [mentionIndex, mentionOpen, mentionOptions])

  const composerValidation = useMemo(() => {
    if (!draft.trim() && mentions.length === 0) return { mentions, error: '' }
    try { return { mentions: bindAssistantToolMentions(draft.trim(), mentions).mentions, error: '' } }
    catch (cause) { return { mentions, error: cause instanceof Error ? cause.message : '请补全本地工具需要的引用。' } }
  }, [draft, mentions])
  const canSend = Boolean(activeProfile && conversationReady && !conversationProfileUnavailable && !busy && !profileSaving && !mentionOpen && (draft.trim() || mentions.length) && !composerValidation.error)

  const createConversation = async () => {
    const conversation = await repository.createConversation(activeProfile?.id ?? providerController.snapshot.defaultProfileId)
    await refreshConversations()
    setArchiveOpen(false)
    onNavigateConversation(conversation.id)
    requestAnimationFrame(() => composerRef.current?.focus())
    return conversation
  }

  const send = async (question = draft.trim(), requestedMentions = mentions) => {
    if (busy || abortRef.current || profileSavingRef.current || (!question && requestedMentions.length === 0)) return
    if (conversationNotFound) { setError('这条研究记录不存在或已被删除。请返回新对话后再发送。'); return }
    if (!conversationReady) { setError('研究记录仍在加载，请稍候再发送。'); return }
    if (conversationProfileUnavailable) { setError('原模型配置已删除或不可用。请先选择一个现有模型服务并保存到这条记录。'); return }
    if (!activeProfile) { setError('请先在设置中添加模型服务。'); return }
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
    runConversationIdRef.current = targetConversationId
    const isStartCurrent = () => runGenerationRef.current === runGeneration && routeConversationIdRef.current === startedRouteConversationId
    const isRunCurrent = () => runGenerationRef.current === runGeneration
      && Boolean(targetConversationId)
      && (routeConversationIdRef.current === targetConversationId || (startedWithoutConversation && routeConversationIdRef.current === undefined))
    try {
      let conversation = visibleBundle?.conversation
      if (!conversation) {
        conversation = await repository.createConversation(activeProfile.id)
        if (!isStartCurrent()) return
        targetConversationId = conversation.id
        runConversationIdRef.current = conversation.id
        createdConversationIdRef.current = conversation.id
        await refreshConversations()
        if (!isRunCurrent()) return
        setArchiveOpen(false)
        onNavigateConversation(conversation.id)
        requestAnimationFrame(() => composerRef.current?.focus())
      }
      if (!isRunCurrent()) return
      const userMessage: AgentMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: 'user', content: question, mentions: boundMentions, status: 'complete', createdAt: new Date().toISOString() }
      await repository.appendMessage(userMessage)
      if (!isRunCurrent()) return
      ++loadGenerationRef.current
      const current = await repository.loadConversation(conversation.id)
      if (!isRunCurrent()) return
      setBundle(current)
      setLoadedConversationId(conversation.id)
      const history: AgentModelMessage[] = (current?.messages ?? [])
        .slice(-(activeProfile.contextTurns * 2 + 1), -1)
        .map((message) => ({ role: message.role, content: messageContentForModel(message) }))
      const result = await runPalAgent({
        question,
        mentions: boundMentions,
        history,
        profile: activeProfile,
        knowledge,
        signal: controller.signal,
        complete: (request) => providerController.service.complete(activeProfile, request, controller.signal, (event) => { if (event.type === 'text-delta' && isRunCurrent()) setStreamedText((currentText) => currentText + event.text) }),
        onStatus: (nextStatus) => { if (isRunCurrent()) setStatus(nextStatus) },
      })
      if (!isRunCurrent()) return
      const assistantMessage: AgentMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: 'assistant', content: result.text, status: 'complete', createdAt: new Date().toISOString(), providerName: activeProfile.displayName, model: activeProfile.model, usage: result.usage }
      await repository.appendMessage(assistantMessage, result.evidence, result.traces)
      if (!isRunCurrent()) return
      ++loadGenerationRef.current
      const nextBundle = await repository.loadConversation(conversation.id)
      if (!isRunCurrent()) return
      setBundle(nextBundle)
      setLoadedConversationId(conversation.id)
      setSelectedMessageId(assistantMessage.id)
      await refreshConversations()
    } catch (cause) {
      if (!isRunCurrent()) return
      const message = cause instanceof Error ? cause.message : '查询失败'
      setError(message)
      if (targetConversationId) {
        await repository.appendMessage({ id: crypto.randomUUID(), conversationId: targetConversationId, role: 'assistant', content: message, status: 'error', createdAt: new Date().toISOString(), providerName: activeProfile.displayName, model: activeProfile.model })
        if (!isRunCurrent()) return
        ++loadGenerationRef.current
        const nextBundle = await repository.loadConversation(targetConversationId)
        if (!isRunCurrent()) return
        setBundle(nextBundle)
        setLoadedConversationId(targetConversationId)
        await refreshConversations()
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
  const switchProfile = async (profileId: string) => {
    if (busy || profileSavingRef.current || !profiles.some((profile) => profile.id === profileId)) return
    if (!conversationReady) { setError('研究记录仍在加载，请稍候再切换模型。'); return }
    const previousProfileId = activeProfile?.id ?? draftProfileId
    setDraftProfileId(profileId)
    if (!visibleBundle || profileId === visibleBundle.conversation.profileId) return
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
      await repository.setConversationProfile(targetConversationId, profileId)
      saved = true
      if (!isSaveCurrent()) return
      const loadGeneration = ++loadGenerationRef.current
      const nextBundle = await repository.loadConversation(targetConversationId)
      if (!isSaveCurrent() || loadGenerationRef.current !== loadGeneration) return
      setBundle(nextBundle)
      setLoadedConversationId(targetConversationId)
    } catch (cause) {
      if (!isSaveCurrent()) return
      if (!saved) setDraftProfileId(previousProfileId)
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
  const renameConversation = async (conversation: AgentConversation) => {
    const title = window.prompt('重命名研究记录', conversation.title)
    if (title === null) return
    try {
      await repository.renameConversation(conversation.id, title)
      await refreshConversations()
      if (conversation.id === routeConversationIdRef.current) {
        const loadGeneration = ++loadGenerationRef.current
        const nextBundle = await repository.loadConversation(conversation.id)
        if (loadGenerationRef.current === loadGeneration && routeConversationIdRef.current === conversation.id) {
          setBundle(nextBundle)
          setLoadedConversationId(conversation.id)
        }
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '重命名失败') }
  }
  const deleteConversation = async (conversation: AgentConversation) => {
    if (!window.confirm(`删除研究记录“${conversation.title}”？`)) return
    await repository.deleteConversation(conversation.id)
    await refreshConversations()
    if (conversation.id === conversationId) onNavigateConversation()
  }
  const clearAll = async () => {
    if (!window.confirm('清空全部研究记录？此操作无法撤销。')) return
    await repository.clear()
    setConversations([])
    setBundle(null)
    setLoadedConversationId(null)
    createdConversationIdRef.current = undefined
    onNavigateConversation()
  }

  const lastUserMessage = [...(visibleBundle?.messages ?? [])].reverse().find((message) => message.role === 'user')

  const showEvidence = (messageId: string, opener: HTMLElement) => {
    evidenceOpenerRef.current = opener
    setSelectedMessageId(messageId)
    setArchiveOpen(false)
    setEvidenceOpen(true)
  }

  const closeMentionPicker = () => {
    setEditingMention(null)
    setMentionOpen(false)
    setMentionQuery('')
    setMentionTrigger(null)
  }

  const cancelMentionPicker = () => {
    const range = editingMention ? mentionTrigger : null
    if (range) {
      setDraft((current) => `${current.slice(0, range.start)}${current.slice(range.end)}`)
      requestAnimationFrame(() => {
        composerRef.current?.focus()
        composerRef.current?.setSelectionRange(range.start, range.start)
      })
    } else requestAnimationFrame(() => composerRef.current?.focus())
    closeMentionPicker()
  }

  const openMentionPicker = (mentionToEdit: AssistantMentionV1 | null = null) => {
    const textarea = composerRef.current
    setEditingMention(mentionToEdit)
    if (mentionOpen) { textarea?.focus(); return }
    const cursor = textarea?.selectionStart ?? draft.length
    const needsSpace = cursor > 0 && !/\s/u.test(draft[cursor - 1] ?? '')
    const insertion = `${needsSpace ? ' ' : ''}@`
    const atIndex = cursor + (needsSpace ? 1 : 0)
    const nextDraft = `${draft.slice(0, cursor)}${insertion}${draft.slice(cursor)}`
    setDraft(nextDraft)
    setMentionQuery('')
    setMentionTrigger({ start: atIndex, end: atIndex + 1, query: '' })
    setMentionIndex(0)
    setMentionOpen(true)
    setComposerError('')
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(atIndex + 1, atIndex + 1)
    })
  }

  const selectMention = (option: MentionOption) => {
    const key = mentionKey(option.mention)
    const editingKey = editingMention ? mentionKey(editingMention) : ''
    const retainedMentions = mentions.filter((mention) => mentionKey(mention) !== editingKey)
    if (retainedMentions.some((mention) => mentionKey(mention) === key)) { setComposerError('这条引用已经添加。'); return }
    const entityCount = retainedMentions.filter((mention) => mention.kind === 'entity').length
    if (entityCount >= 8) { setComposerError('每条消息最多引用 8 个帕鲁、技能或掉落物。'); return }
    const range = mentionTrigger
    if (range) {
      const nextDraft = `${draft.slice(0, range.start)}${draft.slice(range.end)}`
      setDraft(nextDraft)
      requestAnimationFrame(() => {
        composerRef.current?.focus()
        composerRef.current?.setSelectionRange(range.start, range.start)
      })
    }
    setMentions((current) => {
      return editingMention
        ? current.map((mention) => mentionKey(mention) === mentionKey(editingMention) ? option.mention : mention)
        : [...current, option.mention]
    })
    setComposerError('')
    closeMentionPicker()
  }

  const removeMention = (mention: AssistantMentionV1) => {
    const key = mentionKey(mention)
    setMentions((current) => current.filter((item) => mentionKey(item) !== key))
    setComposerError('')
    requestAnimationFrame(() => composerRef.current?.focus())
  }

  const editMention = (mention: AssistantMentionV1) => {
    setComposerError('')
    openMentionPicker(mention)
  }

  const onDraftChange = (value: string, cursor: number) => {
    setDraft(value)
    setComposerError('')
    const trigger = findMentionTrigger(value, cursor)
    if (!trigger) { closeMentionPicker(); return }
    setMentionTrigger(trigger)
    setMentionQuery(trigger.query)
    setMentionIndex(0)
    setMentionOpen(true)
  }

  const onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
    if (mentionOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        if (!mentionOptions.length) return
        setMentionIndex((current) => event.key === 'ArrowDown' ? (current + 1) % mentionOptions.length : (current - 1 + mentionOptions.length) % mentionOptions.length)
        return
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        setMentionIndex(event.key === 'Home' ? 0 : Math.max(0, mentionOptions.length - 1))
        return
      }
      if ((event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault()
        if (mentionOptions[mentionIndex]) selectMention(mentionOptions[mentionIndex])
        else cancelMentionPicker()
        return
      }
      if (event.key === 'Escape') { event.preventDefault(); cancelMentionPicker(); return }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey || event.shiftKey)) {
        event.preventDefault()
        setComposerError('请先完成或关闭 @ 选择，再发送问题。')
        return
      }
    }
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey && !event.shiftKey)) return
    event.preventDefault()
    if (event.repeat) return
    void send()
  }

  const groupedMentionOptions = groupMentionOptions(mentionOptions)

  return (
    <main className="assistant-page">
      <div className={`assistant-workbench ${evidenceOpen ? 'is-evidence-open' : ''} ${archiveOpen ? 'is-archive-open' : ''}`}>
        <aside id="assistant-archive-panel" ref={archiveRef} className="assistant-archive" aria-label="对话档案" aria-hidden={archiveUsesDrawer && !archiveOpen ? true : undefined} inert={archiveUsesDrawer && !archiveOpen ? true : undefined}>
          <div className="assistant-panel-heading">
            <div><span className="assistant-panel-code">ARCHIVE</span><h2>研究记录</h2></div>
            <div className="assistant-panel-actions">
              <button type="button" className="icon-button" aria-label="新建研究记录" data-tooltip="新建研究记录" onClick={() => void createConversation()}><NewRecordIcon /></button>
              <button ref={archiveCloseRef} type="button" className="assistant-archive-close" aria-label="关闭研究记录" data-tooltip="关闭研究记录" onClick={() => { archiveToggleRef.current?.focus({ preventScroll: true }); setArchiveOpen(false) }}>×</button>
            </div>
          </div>
          <div className="assistant-conversation-list">
            {conversations.map((conversation) => (
              <div className={`assistant-conversation ${conversation.id === conversationId ? 'is-active' : ''}`} key={conversation.id}>
                <a href={formatAppRouteHash({ tool: 'assistant', conversationId: conversation.id })}>
                  <strong>{conversation.title}</strong>
                  <small>{new Date(conversation.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                </a>
                <span className="assistant-conversation-actions">
                  <button type="button" aria-label={`重命名${conversation.title}`} data-tooltip="重命名" onClick={() => void renameConversation(conversation)}><EditIcon /></button>
                  <button type="button" aria-label={`删除${conversation.title}`} data-tooltip="删除" onClick={() => void deleteConversation(conversation)}><DeleteIcon /></button>
                </span>
              </div>
            ))}
            {conversations.length === 0 && <p className="assistant-archive-empty">提出第一个问题后，记录会保存在这台设备。</p>}
          </div>
          {conversations.length > 0 && <button type="button" className="assistant-clear-button" onClick={() => void clearAll()}>清空全部记录</button>}
        </aside>

        <section className="assistant-dialogue" aria-label="帕鲁助手对话">
          <header className="assistant-session-bar">
            <div className="assistant-session-identity">
              <span className="assistant-live-mark" aria-hidden="true" />
              <div>
                <h1>帕鲁研究终端</h1>
                <small>{activeProfile
                  ? `${activeProfile.displayName} · ${activeProfile.model || '待填写模型 ID'}`
                  : conversationProfileUnavailable
                    ? '原模型配置已删除或不可用'
                    : providerController.loading
                      ? '正在加载模型服务'
                      : '尚未配置模型服务'}</small>
              </div>
            </div>
            <div className="assistant-session-controls">
              <button ref={archiveToggleRef} type="button" className="assistant-archive-toggle" aria-label="研究记录" data-tooltip="研究记录" aria-controls="assistant-archive-panel" aria-expanded={archiveOpen} onClick={() => { setEvidenceOpen(false); setArchiveOpen((open) => !open) }}><NewRecordIcon /><span>研究记录</span></button>
              <button ref={evidenceToggleRef} type="button" className="assistant-evidence-toggle" aria-label="检索记录" data-tooltip="检索记录" aria-controls="assistant-evidence-panel" aria-expanded={evidenceOpen} onClick={(event) => { setArchiveOpen(false); if (!evidenceOpen) evidenceOpenerRef.current = event.currentTarget; setEvidenceOpen((open) => !open) }}><EvidenceIcon /><span>检索记录</span></button>
            </div>
          </header>

          <div className="assistant-messages" aria-live="polite" aria-busy={conversationLoading}>
            {conversationLoading && <div className="assistant-thinking" role="status"><span aria-hidden="true" /><strong>正在加载研究记录</strong></div>}
            {conversationNotFound && (
              <div className="assistant-empty-state" role="alert">
                <span className="assistant-empty-mark"><AssistantIcon /></span>
                <h2>这条研究记录不存在</h2>
                <p>它可能已被删除，或链接来自另一台设备。你可以返回空白研究页重新开始。</p>
                <a className="assistant-setup-link" href={formatAppRouteHash({ tool: 'assistant' })}>返回新对话</a>
              </div>
            )}
            {!conversationLoading && !conversationNotFound && !visibleBundle?.messages.length && (
              <div className="assistant-empty-state">
                <span className="assistant-empty-mark"><AssistantIcon /></span>
                <p className="eyebrow">LOCAL KNOWLEDGE READY</p>
                <h2>从一条可核对的问题开始</h2>
                <p>助手会先查本地图鉴、技能、掉落和配种索引，再把证据交给你选择的模型整理。</p>
                <div className="assistant-quick-grid">{QUICK_QUESTIONS.map((question) => <button type="button" key={question} onClick={() => { setDraft(question); setMentions([]); setComposerError(''); requestAnimationFrame(() => composerRef.current?.focus()) }}>{question}</button>)}</div>
                {!activeProfile && <a className="assistant-setup-link" href={formatAppRouteHash({ tool: 'settings' })}>前往设置模型服务</a>}
              </div>
            )}
            {visibleBundle?.messages.map((message) => (
              <article className={`assistant-message assistant-message--${message.role} ${message.status === 'error' ? 'is-error' : ''}`} key={message.id}>
                {message.role === 'assistant' && <button type="button" className="assistant-evidence-index" aria-label="查看回答的本地证据" data-tooltip="查看本地证据" onClick={(event) => showEvidence(message.id, event.currentTarget)}>{String((visibleBundle.evidenceByMessage[message.id] ?? []).length).padStart(2, '0')}</button>}
                <div className="assistant-message-body">
                  <span>{message.role === 'user' ? '你' : '研究助手'}</span>
                  {!!message.mentions?.length && <MentionChips mentions={message.mentions} compact />}
                  {message.content && <p>{message.content}</p>}
                  {message.role === 'assistant' && <footer><span>{message.providerName} · {message.model}</span>{(visibleBundle.evidenceByMessage[message.id] ?? []).length > 0 && <button type="button" onClick={(event) => showEvidence(message.id, event.currentTarget)}>依据 {(visibleBundle.evidenceByMessage[message.id] ?? []).length} 条本地记录</button>}</footer>}
                </div>
              </article>
            ))}
            {busy && streamedText && <article className="assistant-message assistant-message--assistant is-streaming"><span className="assistant-evidence-index" aria-hidden="true">··</span><div className="assistant-message-body"><span>研究助手 · 正在生成</span><p>{streamedText}</p></div></article>}
            {busy && <div className="assistant-thinking" role="status"><span aria-hidden="true" /><strong>{status || '正在查询'}</strong></div>}
          </div>

          {(error || conversationProfileUnavailable) && <p className="assistant-error" role="alert">{error || '原模型配置已删除或不可用，这条记录当前为只读。请在下方明确选择一个现有模型服务后再继续。'}</p>}
          <div ref={composerRootRef} className="assistant-composer">
            {mentionOpen && (
              <div className="assistant-mention-panel" style={mentionPanelStyle}>
                <div className="assistant-mention-heading"><strong>选择帕鲁、技能或物品</strong><span role="status" aria-live="polite">{mentionQuery ? `搜索“${mentionQuery}”` : '输入名称、拼音、编号或 ID'} · {mentionOptions.length} 项</span></div>
                <div id={MENTION_LIST_ID} className="assistant-mention-list" role="listbox" aria-label="帕鲁、技能与物品建议">
                  {mentionOptions.length === 0 && <p className="assistant-mention-empty">没有匹配项。按 Esc 关闭后可保留普通 @ 文本。</p>}
                  {groupedMentionOptions.map((group) => (
                    <div className="assistant-mention-group" role="group" aria-label={group.label} key={group.category}>
                      <span className="assistant-mention-group-label">{group.label}</span>
                      {group.options.map(({ option, index }) => (
                        <button id={`assistant-mention-option-${index}`} type="button" role="option" tabIndex={-1} aria-selected={index === mentionIndex} data-mention-kind={option.category} className={index === mentionIndex ? 'is-active' : ''} key={option.key} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setMentionIndex(index)} onClick={() => selectMention(option)}>
                          {option.imagePath
                            ? <img className="assistant-mention-thumbnail" src={localAssetUrl(option.imagePath)} alt="" width="34" height="34" loading="lazy" />
                            : <span className={`assistant-mention-kind assistant-mention-kind--${option.category}`} aria-hidden="true">{mentionCategoryCode(option.category)}</span>}
                          <span><strong>{option.label}</strong><small>{option.detail}</small></span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <small className="assistant-mention-help">↑↓ 选择 · Enter/Tab 添加 · Esc 关闭</small>
              </div>
            )}
            {!!mentions.length && <MentionChips mentions={mentions} onEdit={editMention} onRemove={removeMention} />}
            <textarea
              ref={composerRef}
              name="assistant-question"
              autoComplete="off"
              value={draft}
              rows={2}
              maxLength={2000}
              aria-label="向帕鲁助手提问"
              aria-autocomplete="list"
              aria-haspopup="listbox"
              aria-keyshortcuts="Control+Enter Meta+Enter Shift+Enter"
              aria-controls={mentionOpen ? MENTION_LIST_ID : undefined}
              aria-activedescendant={mentionOpen && mentionOptions[mentionIndex] ? `assistant-mention-option-${mentionIndex}` : undefined}
              aria-describedby={[composerFocused ? 'assistant-composer-hint' : '', composerError || (mentions.length > 0 && composerValidation.error) ? 'assistant-composer-error' : ''].filter(Boolean).join(' ') || undefined}
              placeholder="输入问题，或用 @ 添加帕鲁、技能和物品…"
              onChange={(event) => onDraftChange(event.target.value, event.target.selectionStart)}
              onFocus={() => setComposerFocused(true)}
              onBlur={() => setComposerFocused(false)}
              onKeyDown={onComposerKeyDown}
            />
            {(composerError || (mentions.length > 0 && composerValidation.error)) && <p id="assistant-composer-error" className="assistant-composer-error" role="alert">{composerError || composerValidation.error}</p>}
            <div className="assistant-composer-bar">
              <div className="assistant-composer-guidance">
                <button type="button" className="assistant-mention-trigger" aria-controls={MENTION_LIST_ID} aria-expanded={mentionOpen} aria-haspopup="listbox" onClick={() => openMentionPicker()}><span aria-hidden="true">@</span><span>添加资料</span></button>
                {profiles.length > 0
                  ? (
                    <label className="assistant-model-picker">
                      <span>模型</span>
                      <select name="assistant-profile" autoComplete="off" aria-label="模型服务" aria-busy={profileSaving} value={activeProfile?.id ?? ''} disabled={busy || profileSaving || !conversationReady} onChange={(event) => void switchProfile(event.target.value)}>
                        {conversationProfileUnavailable && <option value="" disabled>原模型不可用，请重新选择</option>}
                        {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.model || '待填写模型 ID'}</option>)}
                      </select>
                    </label>
                  )
                  : <a className="assistant-model-setup" href={formatAppRouteHash({ tool: 'settings' })}>配置模型</a>}
                {composerFocused && <span id="assistant-composer-hint" className="assistant-composer-hint">Enter 换行 · Ctrl/⌘/Shift + Enter 发送</span>}
              </div>
              <div className="assistant-composer-actions">
                {lastUserMessage && !busy && <button type="button" className="assistant-regenerate" disabled={!activeProfile || conversationProfileUnavailable || profileSaving || !conversationReady} onClick={() => void send(lastUserMessage.content, lastUserMessage.mentions ?? [])}>重新生成</button>}
                {busy
                  ? <button type="button" className="assistant-stop" aria-label="停止" data-tooltip="停止生成" onClick={stop}><StopIcon /></button>
                  : <button type="button" className="assistant-send" aria-label="发送" data-tooltip="发送" disabled={!canSend} onClick={() => void send()}><SendIcon /></button>}
              </div>
            </div>
          </div>
        </section>

        <aside id="assistant-evidence-panel" ref={evidenceRef} className="assistant-evidence" aria-label="本地证据与检索轨迹" aria-hidden={evidenceUsesDrawer && !evidenceOpen ? true : undefined} inert={evidenceUsesDrawer && !evidenceOpen ? true : undefined}>
          <div className="assistant-panel-heading"><div><span className="assistant-panel-code">EVIDENCE</span><h2>本地依据</h2></div><button ref={evidenceCloseRef} type="button" className="assistant-drawer-close" aria-label="关闭检索记录" data-tooltip="关闭检索记录" onClick={() => { (evidenceOpenerRef.current ?? evidenceToggleRef.current)?.focus({ preventScroll: true }); setEvidenceOpen(false) }}>×</button></div>
          {selectedTraces.length > 0 && <ol className="assistant-trace-list">{selectedTraces.map((trace, index) => <li key={`${trace.tool}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{trace.label}</strong><small>{traceSourceLabel(trace.source)}命中 {trace.resultCount} 条 · {trace.durationMs} ms</small></div></li>)}</ol>}
          <div className="assistant-evidence-list">{selectedEvidence.map((item, index) => <EvidenceCard key={item.id} item={item} index={index + 1} />)}{selectedEvidence.length === 0 && <p className="assistant-evidence-empty">选择一条助手回答后，这里会显示实际使用的本地记录。</p>}</div>
        </aside>
      </div>
    </main>
  )
}

function MentionChips({ mentions, onEdit, onRemove, compact = false }: { mentions: AssistantMentionV1[]; onEdit?: (mention: AssistantMentionV1) => void; onRemove?: (mention: AssistantMentionV1) => void; compact?: boolean }) {
  return (
    <div className={`assistant-mention-chips ${compact ? 'is-compact' : ''}`} aria-label={compact ? '消息使用的本地引用' : '已选择的本地资料'}>
      {mentions.map((mention) => (
        <span className={`assistant-mention-chip assistant-mention-chip--${mention.kind === 'tool' ? 'tool' : mention.entityType}`} key={mentionKey(mention)}>
          {onEdit && mention.kind === 'entity' ? (
            <button type="button" className="assistant-mention-edit" aria-label={`更换${mentionDisplayLabel(mention)}`} data-tooltip={`更换${mentionDisplayLabel(mention)}`} onClick={() => onEdit(mention)}>
              <span aria-hidden="true">{mentionCategoryCode(mention.entityType)}</span>
              <strong>{mentionDisplayLabel(mention)}</strong>
            </button>
          ) : (
            <><span aria-hidden="true">{mention.kind === 'tool' ? '@' : mentionCategoryCode(mention.entityType)}</span><strong>{mentionDisplayLabel(mention)}</strong></>
          )}
          {onRemove && <button type="button" className="assistant-mention-remove" aria-label={`移除${mentionDisplayLabel(mention)}`} data-tooltip={`移除${mentionDisplayLabel(mention)}`} onClick={() => onRemove(mention)}>×</button>}
        </span>
      ))}
    </div>
  )
}

function mentionDisplayLabel(mention: AssistantMentionV1) {
  if (mention.kind === 'tool'
    && mention.name === 'find_child_by_parents'
    && typeof mention.arguments.parentA === 'string'
    && mention.arguments.parentA === mention.arguments.parentB) return `${mention.label} · 同种双亲`
  return mention.label
}

function EvidenceCard({ item, index }: { item: KnowledgeEvidence; index: number }) {
  const body = <><span className="assistant-evidence-number">{String(index).padStart(2, '0')}</span>{item.imagePath && <img src={localAssetUrl(item.imagePath)} alt="" width="42" height="42" loading="lazy" />}<div><small>{item.kind.toUpperCase()} · {item.datasetVersion}</small><strong>{item.title}</strong><p>{item.summary}</p></div></>
  return item.route ? <a className="assistant-evidence-card" href={item.route}>{body}<span className="assistant-evidence-arrow" aria-hidden="true">→</span></a> : <article className="assistant-evidence-card">{body}</article>
}

function findMentionTrigger(value: string, cursor: number): MentionTrigger | null {
  const beforeCursor = value.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)@([^@\s]*)$/u)
  if (!match) return null
  const query = match[1] ?? ''
  return { start: cursor - query.length - 1, end: cursor, query }
}

function mentionKey(mention: AssistantMentionV1): string {
  return mention.kind === 'tool' ? `tool:${mention.name}` : `entity:${mention.entityType}:${mention.id}`
}

function mentionCategoryLabel(category: MentionCategory): string {
  if (category === 'pal') return '帕鲁'
  if (category === 'skill') return '主动技能'
  return '掉落物'
}

function mentionCategoryCode(category: MentionCategory): string {
  if (category === 'pal') return 'PAL'
  if (category === 'skill') return 'SKL'
  return 'ITM'
}

function mentionDefaultAction(category: MentionCategory): string {
  if (category === 'pal') return '默认读取完整资料；选择 2–4 只可直接比较'
  if (category === 'skill') return '默认查询可学习帕鲁'
  return '默认查询掉落来源'
}

function groupMentionOptions(options: MentionOption[]) {
  const groups: Array<{ category: MentionCategory; label: string; options: Array<{ option: MentionOption; index: number }> }> = []
  options.forEach((option, index) => {
    let group = groups.find((candidate) => candidate.category === option.category)
    if (!group) { group = { category: option.category, label: option.categoryLabel, options: [] }; groups.push(group) }
    group.options.push({ option, index })
  })
  return groups
}

function messageContentForModel(message: AgentMessage): string {
  if (!message.mentions?.length) return message.content
  const references = message.mentions.map((mention) => mention.kind === 'tool' ? `@${mention.label}` : `${mentionCategoryLabel(mention.entityType)}:${mention.label}`).join('、')
  return `${message.content}${message.content ? '\n' : ''}本地引用：${references}`
}

function traceSourceLabel(source?: 'pre-retrieval' | 'intent' | 'mention' | 'model'): string {
  if (source === 'mention') return '用户指定 · '
  if (source === 'model') return '模型调用 · '
  return '自动检索 · '
}

function providerConsentKey(profile: ProviderProfileV1): string {
  let endpoint = profile.baseUrl.trim()
  try { endpoint = new URL(endpoint).href.replace(/\/+$/u, '') }
  catch { /* Invalid URLs are rejected by the provider boundary before a request. */ }
  return `paltools.agent-consent.v1:${profile.id}:${profile.transport}:${encodeURIComponent(endpoint)}`
}

function isKnowledgeEvidence(value: KnowledgeEvidence | null): value is KnowledgeEvidence {
  return value !== null
}
