import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AssistantIcon, EvidenceIcon, NewRecordIcon } from '../../components/ui-icons'
import type { KnowledgeEvidence } from '../../domain/knowledge-contract'
import { LocalKnowledgeService } from '../../domain/knowledge'
import type { ActiveSkillRecord, BreedingIndexPayload, ItemRecord, PalRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { formatAppRouteHash } from '../../lib/app-route'
import { useAssistantComposer } from './useAssistantComposer'
import { AssistantComposer } from './AssistantComposer'
import { useAssistantConversation } from './useAssistantConversation'
import type { AgentMessage } from '../../storage/agent-storage'
import { AssistantArchiveList } from './AssistantArchiveList'
import { AssistantMessages } from './AssistantMessages'
import { AssistantEvidence } from './AssistantEvidence'

const EMPTY_MESSAGES: AgentMessage[] = []
const EMPTY_EVIDENCE_BY_MESSAGE: Record<string, KnowledgeEvidence[]> = {}

const QUICK_QUESTIONS = ['棉悠悠适合做什么？', '怎么配出寐魔？', '比较捣蛋猫和棉悠悠', '哪些帕鲁会掉落羊毛？']
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

export function AssistantPage(props: AssistantPageProps) {
  const { providerController } = props
  const { loading, error, snapshot } = providerController
  if (!loading && snapshot.profiles.length > 0) return <AssistantWorkbench {...props} />

  const loadFailed = Boolean(error || snapshot.developmentProfileError)
  return (
    <main className="assistant-page assistant-setup-page" aria-labelledby="assistant-setup-title">
      <section className="assistant-setup-card" aria-busy={loading}>
        <span className="assistant-empty-mark" aria-hidden="true"><AssistantIcon /></span>
        <p className="eyebrow">帕鲁助手</p>
        <h1 id="assistant-setup-title">{loading ? '正在加载模型服务…' : loadFailed ? '模型服务加载失败' : '先配置模型服务'}</h1>
        {loading ? <p role="status">正在检查已保存的模型配置…</p> : (
          <>
            <p role={loadFailed ? 'alert' : undefined}>{loadFailed ? '暂时无法读取模型配置。请重试加载，或前往设置检查模型服务。' : '连接模型服务后，即可开始对话、引用本地资料并查看回答依据。'}</p>
            <ol>
              <li>前往“设置 → 模型服务”，添加服务。</li>
              <li>填写服务地址、模型与所需的 API Key，保存并测试连接。</li>
              <li>返回助手，开始查询帕鲁知识。</li>
            </ol>
            <div className="assistant-setup-actions">
              <a className="assistant-setup-link" href={formatAppRouteHash({ tool: 'settings' })}>前往配置模型服务</a>
              {loadFailed && <button type="button" className="secondary-button" onClick={() => void providerController.refresh()}>重试加载</button>}
            </div>
            <p className="assistant-setup-note">图鉴、配种与方案工作区可离线使用，已有研究记录会继续保存在本机。</p>
          </>
        )}
      </section>
    </main>
  )
}

function AssistantWorkbench({ pals, skills, items, breedingIndex, datasetVersion, conversationId, providerController, onNavigateConversation }: AssistantPageProps) {
  const knowledge = useMemo(() => new LocalKnowledgeService({ pals, skills, items, breedingIndex, datasetVersion }), [pals, skills, items, breedingIndex, datasetVersion])
  const composer = useAssistantComposer({ pals, skills, items, knowledge })
  const { composerRef, setDraft, setMentions, setComposerError } = composer
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const evidenceRef = useRef<HTMLElement>(null)
  const archiveRef = useRef<HTMLElement>(null)
  const evidenceCloseRef = useRef<HTMLButtonElement>(null)
  const archiveCloseRef = useRef<HTMLButtonElement>(null)
  const evidenceToggleRef = useRef<HTMLButtonElement>(null)
  const archiveToggleRef = useRef<HTMLButtonElement>(null)
  const evidenceOpenerRef = useRef<HTMLElement | null>(null)
  const evidenceUsesDrawer = useMediaQuery('(max-width: 1179px)')
  const archiveUsesDrawer = useMediaQuery('(max-width: 800px)')
  const onConversationCreated = useCallback(() => setArchiveOpen(false), [])
  const conversation = useAssistantConversation({ conversationId, providerController, onNavigateConversation, onConversationCreated, knowledge, composer })
  const { conversations, visibleBundle, conversationLoading, conversationNotFound, conversationProfileUnavailable, activeProfile, activeModelId, busy, status, streamedText, error, selectedEvidence, selectedTraces, setSelectedMessageId, createConversation, renameConversation, deleteConversation, clearAll } = conversation

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

  const showEvidence = useCallback((messageId: string, opener: HTMLElement) => {
    evidenceOpenerRef.current = opener
    setSelectedMessageId(messageId)
    setArchiveOpen(false)
    setEvidenceOpen(true)
  }, [setSelectedMessageId])


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
          <AssistantArchiveList conversations={conversations} conversationId={conversationId} onRenameConversation={renameConversation} onDeleteConversation={deleteConversation} />
          {conversations.length > 0 && <button type="button" className="assistant-clear-button" onClick={() => void clearAll()}>清空全部记录</button>}
        </aside>

        <section className="assistant-dialogue" aria-label="帕鲁助手对话">
          <header className="assistant-session-bar">
            <div className="assistant-session-identity">
              <span className="assistant-live-mark" aria-hidden="true" />
              <div>
                <h1>帕鲁研究终端</h1>
                <small>{activeProfile
                  ? `${activeProfile.displayName} · ${activeModelId || '待填写模型 ID'}`
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
            <AssistantMessages messages={visibleBundle?.messages ?? EMPTY_MESSAGES} evidenceByMessage={visibleBundle?.evidenceByMessage ?? EMPTY_EVIDENCE_BY_MESSAGE} onShowEvidence={showEvidence} />
            {busy && streamedText && <article className="assistant-message assistant-message--assistant is-streaming"><span className="assistant-evidence-index" aria-hidden="true">··</span><div className="assistant-message-body"><span>研究助手 · 正在生成</span><p>{streamedText}</p></div></article>}
            {busy && <div className="assistant-thinking" role="status"><span aria-hidden="true" /><strong>{status || '正在查询'}</strong></div>}
          </div>

          {(error || conversationProfileUnavailable) && <p className="assistant-error" role="alert">{error || '原模型服务或型号已删除，这条记录当前为只读。请在下方明确选择一个可用模型后再继续。'}</p>}
          <AssistantComposer composer={composer} conversation={conversation} />
        </section>

        <aside id="assistant-evidence-panel" ref={evidenceRef} className="assistant-evidence" aria-label="本地证据与检索轨迹" aria-hidden={evidenceUsesDrawer && !evidenceOpen ? true : undefined} inert={evidenceUsesDrawer && !evidenceOpen ? true : undefined}>
          <div className="assistant-panel-heading"><div><span className="assistant-panel-code">EVIDENCE</span><h2>本地依据</h2></div><button ref={evidenceCloseRef} type="button" className="assistant-drawer-close" aria-label="关闭检索记录" data-tooltip="关闭检索记录" onClick={() => { (evidenceOpenerRef.current ?? evidenceToggleRef.current)?.focus({ preventScroll: true }); setEvidenceOpen(false) }}>×</button></div>
          <AssistantEvidence evidence={selectedEvidence} traces={selectedTraces} />
        </aside>
      </div>
    </main>
  )
}
