import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { bindAssistantToolMentions } from '../../domain/agent-runner'
import type { AssistantEntityMentionV1, AssistantMentionV1, KnowledgeEvidence } from '../../domain/knowledge-contract'
import type { LocalKnowledgeService } from '../../domain/knowledge'
import type { ActiveSkillRecord, ItemRecord, PalRecord } from '../../domain/types'
import { mentionCategoryLabel, mentionKey, type MentionCategory } from './AssistantMentions'

export const MENTION_LIST_ID = 'assistant-mention-listbox'

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

export function useAssistantComposer({ pals, skills, items, knowledge }: { pals: PalRecord[]; skills: ActiveSkillRecord[]; items: ItemRecord[]; knowledge: LocalKnowledgeService }) {
  const [draft, setDraft] = useState('')
  const [mentions, setMentions] = useState<AssistantMentionV1[]>([])
  const composerContentRef = useRef({ draft, mentions })
  composerContentRef.current = { draft, mentions }
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [editingMention, setEditingMention] = useState<AssistantMentionV1 | null>(null)
  const [mentionPanelStyle, setMentionPanelStyle] = useState<CSSProperties>()
  const [composerError, setComposerError] = useState('')
  const [composerFocused, setComposerFocused] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const composerRootRef = useRef<HTMLDivElement>(null)

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

  const onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>, onSend: () => void) => {
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
    onSend()
  }

  const groupedMentionOptions = groupMentionOptions(mentionOptions)

  return { draft, mentions, composerContentRef, mentionOpen, mentionQuery, mentionIndex, mentionPanelStyle, composerError, composerFocused, composerRef, composerRootRef, mentionOptions, groupedMentionOptions, composerValidation, setDraft, setMentions, setMentionOpen, setComposerError, setComposerFocused, setMentionIndex, editMention, removeMention, openMentionPicker, selectMention, onDraftChange, onComposerKeyDown }
}

function findMentionTrigger(value: string, cursor: number): MentionTrigger | null {
  const beforeCursor = value.slice(0, cursor)
  const match = beforeCursor.match(/(?:^|\s)@([^@\s]*)$/u)
  if (!match) return null
  const query = match[1] ?? ''
  return { start: cursor - query.length - 1, end: cursor, query }
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

function isKnowledgeEvidence(value: KnowledgeEvidence | null): value is KnowledgeEvidence {
  return value !== null
}

export type AssistantComposerController = ReturnType<typeof useAssistantComposer>
