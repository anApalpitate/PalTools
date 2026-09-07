// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Profiler, type ProfilerOnRenderCallback } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createProviderProfile } from '../../domain/agent'
import type { AgentModelResult, AgentStreamEvent } from '../../domain/provider-adapters'
import type { ItemRecord } from '../../domain/types'
import type { ProviderProfilesController } from '../../hooks/useProviderProfiles'
import { ProviderService } from '../../lib/provider-service'
import type { AgentConversation, AgentConversationBundle, AgentMessage } from '../../storage/agent-storage'
import { AssistantPage } from './AssistantPage'

const repository = vi.hoisted(() => ({
  listConversations: vi.fn(),
  loadConversation: vi.fn(),
  appendMessage: vi.fn(),
  createConversation: vi.fn(),
  setConversationTarget: vi.fn(),
  renameConversation: vi.fn(),
  deleteConversation: vi.fn(),
  clear: vi.fn(),
  close: vi.fn(),
}))

vi.mock('../../storage/agent-storage', () => ({
  AgentRepository: class {
    listConversations = repository.listConversations
    loadConversation = repository.loadConversation
    appendMessage = repository.appendMessage
    createConversation = repository.createConversation
    setConversationTarget = repository.setConversationTarget
    renameConversation = repository.renameConversation
    deleteConversation = repository.deleteConversation
    clear = repository.clear
    close = repository.close
  },
}))

const HISTORY_COUNT = 80
const CONVERSATION_COUNT = 20
const CHUNK_COUNT = 30
const performancePhase = process.env.PALTOOLS_ASSISTANT_PERF_PHASE ?? 'after'

function deferred<T>() {
  let resolveValue!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => { resolveValue = resolvePromise })
  return { promise, resolve: resolveValue }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  localStorage.clear()
})

it('profiles fixed streaming events without losing text or changing historical records', async () => {
  expect(['before', 'after']).toContain(performancePhase)
  const reads = { historyContent: 0, archiveTitle: 0 }
  const baseProfile = createProviderProfile('ollama')
  const profile = {
    ...baseProfile,
    id: 'performance-profile',
    displayName: 'Synthetic performance model',
    defaultModelId: 'performance-model',
    models: [{ ...baseProfile.models[0], modelId: 'performance-model', contextTurns: 30, capabilityMode: 'retrieval-only' as const }],
  }
  const conversations: AgentConversation[] = Array.from({ length: CONVERSATION_COUNT }, (_, index) => ({
    id: `conversation-${index}`,
    get title() { reads.archiveTitle += 1; return `固定研究记录 ${index}` },
    profileId: profile.id,
    modelId: profile.defaultModelId,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: new Date(Date.UTC(2026, 8, 1, 0, index)).toISOString(),
  }))
  const historicalMessages: AgentMessage[] = Array.from({ length: HISTORY_COUNT }, (_, index) => ({
    id: `history-${index}`,
    conversationId: conversations[0].id,
    role: index % 2 === 0 ? 'user' : 'assistant',
    get content() { reads.historyContent += 1; return `固定历史消息 ${index}：已有资料保持完整。` },
    status: 'complete',
    createdAt: new Date(Date.UTC(2026, 8, 1, 1, index)).toISOString(),
    providerName: profile.displayName,
    model: profile.defaultModelId,
  }))
  let bundle: AgentConversationBundle = { conversation: conversations[0], messages: historicalMessages, evidenceByMessage: {}, tracesByMessage: {} }
  repository.listConversations.mockImplementation(async () => conversations)
  repository.loadConversation.mockImplementation(async () => bundle)
  repository.appendMessage.mockImplementation(async (message: AgentMessage) => {
    bundle = { ...bundle, messages: [...bundle.messages, message] }
  })
  repository.setConversationTarget.mockResolvedValue(undefined)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const network = vi.fn(() => Promise.reject(new Error('Performance fixture must not access the network')))
  vi.stubGlobal('fetch', network)

  const providerEntered = deferred<void>()
  const response = deferred<AgentModelResult>()
  let emit!: (event: AgentStreamEvent) => void
  const service = new ProviderService()
  const complete = vi.spyOn(service, 'complete').mockImplementation((_profile, _request, _signal, onEvent) => {
    if (!onEvent) throw new Error('Expected the production streaming callback')
    emit = onEvent
    providerEntered.resolve()
    return response.promise
  })
  const controller: ProviderProfilesController = {
    service,
    snapshot: { profiles: [profile], defaultProfileId: profile.id, encryptionAvailable: false, managedProfileIds: [], platform: 'web' },
    loading: false, error: '', save: vi.fn(), remove: vi.fn(), setDefault: vi.fn(), refresh: vi.fn(),
  }
  const commits: Array<{ phase: string; actualDurationMs: number; baseDurationMs: number }> = []
  const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration, baseDuration) => {
    commits.push({ phase, actualDurationMs: actualDuration, baseDurationMs: baseDuration })
  }
  const dateFormat = vi.spyOn(Date.prototype, 'toLocaleString')
  const item: ItemRecord = { id: 'Wool', name: '羊毛', icon: { localPath: '/generated/items/Wool.webp', sourceUrl: 'https://fixture.invalid/wool', sha256: 'a'.repeat(64) } }
  const view = render(
    <Profiler id="assistant-workbench" onRender={onRender}>
      <AssistantPage pals={[]} skills={[]} items={[item]} breedingIndex={null} datasetVersion="performance-v1" conversationId={conversations[0].id} providerController={controller} onNavigateConversation={vi.fn()} />
    </Profiler>,
  )
  await screen.findByText(`固定历史消息 ${HISTORY_COUNT - 1}：已有资料保持完整。`)
  expect(document.querySelectorAll('.assistant-conversation')).toHaveLength(CONVERSATION_COUNT)
  expect(document.querySelectorAll('.assistant-message')).toHaveLength(HISTORY_COUNT)
  fireEvent.change(screen.getByLabelText('向帕鲁助手提问'), { target: { value: '羊毛资料' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  await waitFor(() => expect(complete).toHaveBeenCalledTimes(1))
  await act(async () => { await providerEntered.promise })
  await waitFor(() => expect(document.querySelectorAll('.assistant-message')).toHaveLength(HISTORY_COUNT + 1))

  // Only the 30 incremental text events are measured; loading, persistence and
  // final response reconciliation legitimately change the message/archive data.
  const setupCommitCount = commits.length
  commits.length = 0
  reads.historyContent = 0
  reads.archiveTitle = 0
  dateFormat.mockClear()
  const chunks = Array.from({ length: CHUNK_COUNT }, (_, index) => `片段${String(index + 1).padStart(2, '0')}。`)
  let expectedText = ''
  for (const chunk of chunks) {
    await act(async () => { emit({ type: 'text-delta', text: chunk }) })
    expectedText += chunk
    expect(document.querySelector('.is-streaming .assistant-message-body p')).toHaveTextContent(expectedText)
  }
  const stream = {
    commitCount: commits.length,
    actualDurationMs: Number(commits.reduce((total, commit) => total + commit.actualDurationMs, 0).toFixed(3)),
    historyContentReads: reads.historyContent,
    archiveTitleReads: reads.archiveTitle,
    archiveDateFormats: dateFormat.mock.calls.length,
    commits: [...commits],
  }
  const streamText = document.querySelector('.is-streaming .assistant-message-body p')?.textContent
  expect(streamText).toBe(expectedText)
  expect(stream.commitCount).toBeGreaterThan(0)
  if (performancePhase === 'after') {
    expect(stream.historyContentReads).toBe(0)
    expect(stream.archiveTitleReads).toBe(0)
    expect(stream.archiveDateFormats).toBe(0)
  } else {
    expect(stream.historyContentReads).toBeGreaterThan(0)
    expect(stream.archiveTitleReads).toBeGreaterThan(0)
  }

  await act(async () => { response.resolve({ text: expectedText, toolCalls: [] }) })
  await waitFor(() => expect(document.querySelector('.is-streaming')).not.toBeInTheDocument())
  expect(screen.getAllByText(expectedText)).toHaveLength(1)
  expect(document.querySelectorAll('.assistant-message')).toHaveLength(HISTORY_COUNT + 2)
  expect(screen.getByText('固定历史消息 0：已有资料保持完整。')).toBeInTheDocument()
  expect(screen.getByText(`固定历史消息 ${HISTORY_COUNT - 1}：已有资料保持完整。`)).toBeInTheDocument()
  expect(repository.appendMessage).toHaveBeenCalledTimes(2)
  expect(repository.appendMessage.mock.calls[1][0]).toMatchObject({ role: 'assistant', content: expectedText, status: 'complete' })
  expect(complete).toHaveBeenCalledTimes(1)
  expect(network).not.toHaveBeenCalled()

  const measurement = {
    schemaVersion: 1,
    phase: performancePhase,
    fixture: { historyMessages: HISTORY_COUNT, conversations: CONVERSATION_COUNT, textEvents: CHUNK_COUNT },
    setupCommitCount,
    completionCommitCount: commits.length - stream.commitCount,
    stream,
  }
  console.log(`Assistant performance ${performancePhase}: ${JSON.stringify({ ...measurement, stream: { ...stream, commits: undefined } })}`)
  const report = process.env.PALTOOLS_ASSISTANT_PERF_REPORT
  if (report) {
    if (!/^[a-zA-Z0-9_-]+$/.test(report)) throw new Error('PALTOOLS_ASSISTANT_PERF_REPORT must be a filename label using letters, numbers, underscore or hyphen')
    const outputDirectory = resolve(process.cwd(), 'output', 'agent-runs')
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(resolve(outputDirectory, `assistant-performance-${report}.json`), `${JSON.stringify(measurement, null, 2)}\n`, 'utf8')
  }
  view.unmount()
  expect(repository.close).toHaveBeenCalledTimes(1)
})
