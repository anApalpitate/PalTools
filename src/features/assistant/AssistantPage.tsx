import { useEffect, useMemo, useRef, useState } from 'react'
import { AssistantIcon, DeleteIcon, EditIcon, EvidenceIcon, NewRecordIcon, SendIcon, StopIcon } from '../../components/ui-icons'
import { LocalKnowledgeService, type KnowledgeEvidence, type LocalToolTrace } from '../../domain/knowledge'
import { runPalAgent } from '../../domain/agent-runner'
import type { AgentModelMessage } from '../../domain/provider-adapters'
import type { ActiveSkillRecord, BreedingIndexPayload, ItemRecord, PalRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { formatAppRouteHash } from '../../lib/app-route'
import { localAssetUrl } from '../../lib/assets'
import { AgentRepository, type AgentConversation, type AgentConversationBundle, type AgentMessage } from '../../storage/agent-storage'

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

export function AssistantPage({ pals, skills, items, breedingIndex, datasetVersion, conversationId, providerController, onNavigateConversation }: AssistantPageProps) {
  const repository = useMemo(() => new AgentRepository(), [])
  const knowledge = useMemo(() => new LocalKnowledgeService({ pals, skills, items, breedingIndex, datasetVersion }), [pals, skills, items, breedingIndex, datasetVersion])
  const [conversations, setConversations] = useState<AgentConversation[]>([])
  const [bundle, setBundle] = useState<AgentConversationBundle | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [streamedText, setStreamedText] = useState('')
  const [error, setError] = useState('')
  const [selectedMessageId, setSelectedMessageId] = useState('')
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const evidenceRef = useRef<HTMLElement>(null)
  const archiveRef = useRef<HTMLElement>(null)
  const evidenceToggleRef = useRef<HTMLButtonElement>(null)
  const archiveToggleRef = useRef<HTMLButtonElement>(null)

  const refreshConversations = async () => setConversations(await repository.listConversations())
  useEffect(() => { void refreshConversations().catch((cause) => setError(cause instanceof Error ? cause.message : '对话加载失败')) }, [repository])
  useEffect(() => {
    if (!conversationId) { setBundle(null); setSelectedMessageId(''); return }
    void repository.loadConversation(conversationId).then((next) => { setBundle(next); setSelectedMessageId([...next?.messages ?? []].reverse().find((message) => message.role === 'assistant')?.id ?? '') }).catch((cause) => setError(cause instanceof Error ? cause.message : '对话加载失败'))
  }, [conversationId, repository])
  useEffect(() => {
    const container = evidenceOpen ? evidenceRef.current : archiveOpen ? archiveRef.current : null
    if (!container) return
    const focusable = () => [...container.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (evidenceOpen) setEvidenceOpen(false); else setArchiveOpen(false); return }
      if (event.key !== 'Tab') return
      const items = focusable(); if (!items.length) return
      const first = items[0]; const last = items.at(-1)!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    container.addEventListener('keydown', onKeyDown)
    requestAnimationFrame(() => focusable()[0]?.focus())
    return () => { container.removeEventListener('keydown', onKeyDown); requestAnimationFrame(() => (evidenceOpen ? evidenceToggleRef.current : archiveToggleRef.current)?.focus()) }
  }, [archiveOpen, evidenceOpen])

  const activeProfileId = bundle?.conversation.profileId || providerController.snapshot.defaultProfileId
  const activeProfile = providerController.snapshot.profiles.find((profile) => profile.id === activeProfileId) ?? providerController.snapshot.profiles[0]
  const selectedEvidence = bundle?.evidenceByMessage[selectedMessageId] ?? []
  const selectedTraces = bundle?.tracesByMessage[selectedMessageId] ?? []

  const createConversation = async () => {
    const conversation = await repository.createConversation(providerController.snapshot.defaultProfileId)
    await refreshConversations(); onNavigateConversation(conversation.id); requestAnimationFrame(() => composerRef.current?.focus())
    return conversation
  }

  const send = async (question = draft.trim()) => {
    if (!question || busy) return
    if (!activeProfile) { setError('请先在设置中添加模型服务。'); return }
    if (!localStorage.getItem(`paltools.agent-consent.v1:${activeProfile.id}`)) {
      const accepted = window.confirm(`发送后，当前问题、必要对话上下文和本地检索片段会传给“${activeProfile.displayName}”。继续吗？`)
      if (!accepted) return
      localStorage.setItem(`paltools.agent-consent.v1:${activeProfile.id}`, 'accepted')
    }
    setBusy(true); setDraft(''); setError(''); setStatus('正在检索本地知识'); setStreamedText('')
    const controller = new AbortController(); abortRef.current = controller
    let currentConversationId = bundle?.conversation.id ?? ''
    try {
      const conversation = bundle?.conversation ?? await createConversation()
      currentConversationId = conversation.id
      const userMessage: AgentMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: 'user', content: question, status: 'complete', createdAt: new Date().toISOString() }
      await repository.appendMessage(userMessage)
      const current = await repository.loadConversation(conversation.id)
      setBundle(current)
      const history: AgentModelMessage[] = (current?.messages ?? []).slice(-(activeProfile.contextTurns * 2 + 1), -1).map((message) => ({ role: message.role, content: message.content }))
      const result = await runPalAgent({ question, history, profile: activeProfile, knowledge, complete: (request) => providerController.service.complete(activeProfile, request, controller.signal, (event) => { if (event.type === 'text-delta') setStreamedText((current) => current + event.text) }), onStatus: setStatus })
      const assistantMessage: AgentMessage = { id: crypto.randomUUID(), conversationId: conversation.id, role: 'assistant', content: result.text, status: 'complete', createdAt: new Date().toISOString(), providerName: activeProfile.displayName, model: activeProfile.model, usage: result.usage }
      await repository.appendMessage(assistantMessage, result.evidence, result.traces)
      setBundle(await repository.loadConversation(conversation.id)); setSelectedMessageId(assistantMessage.id); await refreshConversations()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '查询失败'
      setError(message)
      if (currentConversationId) {
        await repository.appendMessage({ id: crypto.randomUUID(), conversationId: currentConversationId, role: 'assistant', content: message, status: 'error', createdAt: new Date().toISOString(), providerName: activeProfile.displayName, model: activeProfile.model })
        setBundle(await repository.loadConversation(currentConversationId)); await refreshConversations()
      }
    } finally { setBusy(false); setStatus(''); setStreamedText(''); abortRef.current = null }
  }

  const stop = () => { abortRef.current?.abort(); setStatus('正在停止') }
  const switchProfile = async (profileId: string) => {
    if (!bundle) return
    await repository.setConversationProfile(bundle.conversation.id, profileId)
    setBundle(await repository.loadConversation(bundle.conversation.id))
  }
  const renameConversation = async (conversation: AgentConversation) => {
    const title = window.prompt('重命名研究记录', conversation.title)
    if (title === null) return
    try { await repository.renameConversation(conversation.id, title); await refreshConversations(); if (conversation.id === conversationId) setBundle(await repository.loadConversation(conversation.id)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '重命名失败') }
  }
  const deleteConversation = async (conversation: AgentConversation) => {
    if (!window.confirm(`删除研究记录“${conversation.title}”？`)) return
    await repository.deleteConversation(conversation.id); await refreshConversations(); if (conversation.id === conversationId) onNavigateConversation()
  }
  const clearAll = async () => {
    if (!window.confirm('清空全部研究记录？此操作无法撤销。')) return
    await repository.clear(); setConversations([]); setBundle(null); onNavigateConversation()
  }
  const lastQuestion = [...(bundle?.messages ?? [])].reverse().find((message) => message.role === 'user')?.content

  return (
    <main className="assistant-page">
      <section className="page-heading assistant-heading">
        <div><p className="eyebrow">FIELD QUERY / 本地证据优先</p><h1>帕鲁研究终端</h1><p>用本地图鉴与配种索引回答，每条结论都能回到原始记录。</p></div>
        <div className="assistant-heading-actions"><button ref={archiveToggleRef} type="button" className="assistant-archive-toggle" aria-expanded={archiveOpen} onClick={() => { setEvidenceOpen(false); setArchiveOpen((open) => !open) }}><NewRecordIcon /><span>研究记录</span></button><button ref={evidenceToggleRef} type="button" className="assistant-evidence-toggle" aria-expanded={evidenceOpen} onClick={() => { setArchiveOpen(false); setEvidenceOpen((open) => !open) }}><EvidenceIcon /><span>检索记录</span></button></div>
      </section>

      <div className={`assistant-workbench ${evidenceOpen ? 'is-evidence-open' : ''} ${archiveOpen ? 'is-archive-open' : ''}`}>
        <aside ref={archiveRef} className="assistant-archive" aria-label="对话档案">
          <div className="assistant-panel-heading"><div><span className="assistant-panel-code">ARCHIVE</span><h2>研究记录</h2></div><div className="assistant-panel-actions"><button type="button" className="icon-button" aria-label="新建研究记录" title="新建研究记录" onClick={() => void createConversation()}><NewRecordIcon /></button><button type="button" className="assistant-archive-close" aria-label="关闭研究记录" onClick={() => setArchiveOpen(false)}>×</button></div></div>
          <div className="assistant-conversation-list">
            {conversations.map((conversation) => <div className={`assistant-conversation ${conversation.id === conversationId ? 'is-active' : ''}`} key={conversation.id}><a href={formatAppRouteHash({ tool: 'assistant', conversationId: conversation.id })}><strong>{conversation.title}</strong><small>{new Date(conversation.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</small></a><span className="assistant-conversation-actions"><button type="button" aria-label={`重命名${conversation.title}`} title="重命名" onClick={() => void renameConversation(conversation)}><EditIcon /></button><button type="button" aria-label={`删除${conversation.title}`} title="删除" onClick={() => void deleteConversation(conversation)}><DeleteIcon /></button></span></div>)}
            {conversations.length === 0 && <p className="assistant-archive-empty">提出第一个问题后，记录会保存在这台设备。</p>}
          </div>
          {conversations.length > 0 && <button type="button" className="assistant-clear-button" onClick={() => void clearAll()}>清空全部记录</button>}
        </aside>

        <section className="assistant-dialogue" aria-label="帕鲁助手对话">
          <header className="assistant-session-bar"><span className="assistant-live-mark" aria-hidden="true" /><div><strong>{activeProfile?.displayName ?? '尚未配置模型'}</strong><small>{activeProfile?.model || '在本机设置中填写 API 与模型参数'}</small></div>{bundle && activeProfile && <select name="assistant-profile" autoComplete="off" aria-label="当前对话模型配置" value={activeProfile.id} disabled={busy} onChange={(event) => void switchProfile(event.target.value)}>{providerController.snapshot.profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName} · {profile.model}</option>)}</select>}</header>
          <div className="assistant-messages" aria-live="polite">
            {!bundle?.messages.length && <div className="assistant-empty-state"><span className="assistant-empty-mark"><AssistantIcon /></span><p className="eyebrow">LOCAL KNOWLEDGE READY</p><h2>从一条可核对的问题开始</h2><p>助手会先查本地图鉴、技能、掉落和配种索引，再把证据交给你选择的模型整理。</p><div className="assistant-quick-grid">{QUICK_QUESTIONS.map((question) => <button type="button" key={question} onClick={() => { setDraft(question); requestAnimationFrame(() => composerRef.current?.focus()) }}>{question}</button>)}</div>{!activeProfile && <a className="assistant-setup-link" href={formatAppRouteHash({ tool: 'settings' })}>前往设置模型服务</a>}</div>}
            {bundle?.messages.map((message) => <article className={`assistant-message assistant-message--${message.role} ${message.status === 'error' ? 'is-error' : ''}`} key={message.id}>{message.role === 'assistant' && <button type="button" className="assistant-evidence-index" aria-label={`查看回答的本地证据`} onClick={() => { setSelectedMessageId(message.id); setEvidenceOpen(true) }}>{String((bundle.evidenceByMessage[message.id] ?? []).length).padStart(2, '0')}</button>}<div className="assistant-message-body"><span>{message.role === 'user' ? '你' : '研究助手'}</span><p>{message.content}</p>{message.role === 'assistant' && <footer><span>{message.providerName} · {message.model}</span>{(bundle.evidenceByMessage[message.id] ?? []).length > 0 && <button type="button" onClick={() => { setSelectedMessageId(message.id); setEvidenceOpen(true) }}>依据 {(bundle.evidenceByMessage[message.id] ?? []).length} 条本地记录</button>}</footer>}</div></article>)}
            {busy && streamedText && <article className="assistant-message assistant-message--assistant is-streaming"><span className="assistant-evidence-index" aria-hidden="true">··</span><div className="assistant-message-body"><span>研究助手 · 正在生成</span><p>{streamedText}</p></div></article>}
            {busy && <div className="assistant-thinking" role="status"><span aria-hidden="true" /><strong>{status || '正在查询'}</strong></div>}
          </div>
          {error && <p className="assistant-error" role="alert">{error}</p>}
          <div className="assistant-composer"><textarea ref={composerRef} name="assistant-question" autoComplete="off" value={draft} rows={3} maxLength={2000} aria-label="向帕鲁助手提问" placeholder="例如：怎么配出寐魔？" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} /><div className="assistant-composer-bar"><span>Enter 发送 · Shift+Enter 换行</span><div>{lastQuestion && !busy && <button type="button" className="assistant-regenerate" onClick={() => void send(lastQuestion)}>重新生成</button>}{busy ? <button type="button" className="assistant-stop" onClick={stop}><StopIcon /><span>停止</span></button> : <button type="button" className="assistant-send" disabled={!draft.trim() || !activeProfile} onClick={() => void send()}><SendIcon /><span>发送</span></button>}</div></div></div>
        </section>

        <aside ref={evidenceRef} className="assistant-evidence" aria-label="本地证据与检索轨迹">
          <div className="assistant-panel-heading"><div><span className="assistant-panel-code">EVIDENCE</span><h2>本地依据</h2></div><button type="button" className="assistant-drawer-close" aria-label="关闭检索记录" onClick={() => setEvidenceOpen(false)}>×</button></div>
          {selectedTraces.length > 0 && <ol className="assistant-trace-list">{selectedTraces.map((trace, index) => <li key={`${trace.tool}-${index}`}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{trace.label}</strong><small>命中 {trace.resultCount} 条 · {trace.durationMs} ms</small></div></li>)}</ol>}
          <div className="assistant-evidence-list">{selectedEvidence.map((item, index) => <EvidenceCard key={item.id} item={item} index={index + 1} />)}{selectedEvidence.length === 0 && <p className="assistant-evidence-empty">选择一条助手回答后，这里会显示实际使用的本地记录。</p>}</div>
        </aside>
      </div>
    </main>
  )
}

function EvidenceCard({ item, index }: { item: KnowledgeEvidence; index: number }) {
  const body = <><span className="assistant-evidence-number">{String(index).padStart(2, '0')}</span>{item.imagePath && <img src={localAssetUrl(item.imagePath)} alt="" width="42" height="42" loading="lazy" />}<div><small>{item.kind.toUpperCase()} · {item.datasetVersion}</small><strong>{item.title}</strong><p>{item.summary}</p></div></>
  return item.route ? <a className="assistant-evidence-card" href={item.route}>{body}<span className="assistant-evidence-arrow" aria-hidden="true">→</span></a> : <article className="assistant-evidence-card">{body}</article>
}
