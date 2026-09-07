// @vitest-environment jsdom

import { IDBFactory, IDBIndex, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KnowledgeEvidence, LocalToolTrace } from '../domain/knowledge-contract'
import { AGENT_DB_NAME, AgentRepository } from './agent-storage'

afterEach(() => vi.restoreAllMocks())

const evidence: KnowledgeEvidence = { id: 'pal:SheepBall', kind: 'pal', title: '棉悠悠', summary: '手工作业 Lv.1', matchedFields: ['工作适性'], score: 1, datasetVersion: 'v1' }
const trace: LocalToolTrace = { tool: 'get_pal_profile', label: '读取棉悠悠', resultCount: 1, durationMs: 1, source: 'mention' }

function openTestDatabase(factory: IDBFactory, version = 1) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(AGENT_DB_NAME, version)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database upgrade blocked by an open connection'))
  })
}

function deleteTestDatabase(factory: IDBFactory) {
  return new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(AGENT_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Database deletion blocked by an open connection'))
  })
}

async function readRecords(factory: IDBFactory) {
  const database = await openTestDatabase(factory)
  try {
    const stores = ['conversations', 'messages', 'evidence', 'traces']
    const transaction = database.transaction(stores, 'readonly')
    return await Promise.all(stores.map((name) => new Promise<unknown[]>((resolve, reject) => {
      const request = transaction.objectStore(name).getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })))
  } finally { database.close() }
}

describe('agent repository', () => {
  it('reads evidence and traces only through indexes for the current messages', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    const current = await repository.createConversation()
    const unrelated = await repository.createConversation()
    for (const [id, conversationId] of [['current-1', current.id], ['current-2', current.id], ['unrelated', unrelated.id]]) {
      await repository.appendMessage({ id, conversationId, role: 'assistant', content: id, status: 'complete', createdAt: '2026-09-08T00:00:00.000Z' }, [evidence], [trace])
    }
    const database = await openTestDatabase(factory)
    const transaction = database.transaction(['evidence', 'traces'], 'readwrite')
    transaction.objectStore('evidence').put({ id: 'bad-evidence', messageId: 'unrelated', kind: 'invalid' })
    transaction.objectStore('traces').put({ id: 'bad-trace', messageId: 'unrelated', tool: 'invalid' })
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
    database.close()
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const indexedReads = vi.spyOn(IDBIndex.prototype, 'getAll')

    const loaded = await repository.loadConversation(current.id)

    expect(loaded?.messages.map((message) => message.id)).toEqual(['current-1', 'current-2'])
    expect(Object.keys(loaded?.evidenceByMessage ?? {})).toEqual(['current-1', 'current-2'])
    expect(Object.keys(loaded?.tracesByMessage ?? {})).toEqual(['current-1', 'current-2'])
    expect(getAll).not.toHaveBeenCalled()
    expect(indexedReads.mock.contexts.map((index) => (index as IDBIndex).objectStore.name)).toEqual(['messages', 'evidence', 'evidence', 'traces', 'traces'])
    expect(indexedReads.mock.calls.slice(1).map(([query]) => (query as IDBKeyRange).lower)).toEqual(['current-1', 'current-2', 'current-1', 'current-2'])
    await expect(repository.loadConversation(unrelated.id)).rejects.toThrow('这份研究记录已损坏')
  })

  it('does not read evidence or traces for an empty conversation', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const repository = new AgentRepository(new IDBFactory())
    const conversation = await repository.createConversation()
    const getAll = vi.spyOn(IDBObjectStore.prototype, 'getAll')
    const indexedReads = vi.spyOn(IDBIndex.prototype, 'getAll')

    expect((await repository.loadConversation(conversation.id))?.messages).toEqual([])
    expect(getAll).not.toHaveBeenCalled()
    expect(indexedReads.mock.contexts.map((index) => (index as IDBIndex).objectStore.name)).toEqual(['messages'])
  })

  it('finishes operations accepted before close, rejects new ones, and releases the connection', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    const conversation = await repository.createConversation()
    const reading = repository.loadConversation(conversation.id)
    const writing = repository.appendMessage({ id: 'accepted', conversationId: conversation.id, role: 'assistant', content: '保存中的回答', status: 'complete', createdAt: '2026-09-08T00:00:00.000Z' }, [evidence], [trace])
    repository.close()
    repository.close()

    await expect(reading).resolves.toMatchObject({ conversation: { id: conversation.id } })
    await expect(writing).resolves.toBeUndefined()
    await expect(repository.listConversations()).rejects.toThrow('连接已关闭')
    expect((await readRecords(factory))[1]).toHaveLength(1)
    await expect(deleteTestDatabase(factory)).resolves.toBeUndefined()
  })

  it.each([false, true])('closes a pending open with an accepted operation: %s', async (acceptOperation) => {
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    const pending = acceptOperation ? repository.createConversation() : null
    repository.close()

    if (pending) await expect(pending).resolves.toMatchObject({ title: '新的研究记录' })
    await expect(deleteTestDatabase(factory)).resolves.toBeUndefined()
  })

  it('releases its connection when another client changes the database version', async () => {
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    await repository.listConversations()

    const upgraded = await openTestDatabase(factory, 2)
    upgraded.close()

    await expect(repository.listConversations()).rejects.toThrow('连接已关闭')
    await expect(deleteTestDatabase(factory)).resolves.toBeUndefined()
  })

  it('handles an open failure before a caller consumes the repository', async () => {
    const factory = new IDBFactory()
    const newer = await openTestDatabase(factory, 2)
    newer.close()
    const open = vi.spyOn(factory, 'open')
    const repository = new AgentRepository(factory)
    const request = open.mock.results[0].value as IDBOpenDBRequest
    await new Promise<void>((resolve) => request.addEventListener('error', () => resolve()))
    await new Promise((resolve) => setTimeout(resolve, 0))

    await expect(repository.listConversations()).rejects.toMatchObject({ name: 'VersionError' })
    repository.close()
  })

  it.each([
    { name: 'first evidence', evidence: [{ ...evidence, score: Number.NaN }], traces: [trace] },
    { name: 'later evidence', evidence: [evidence, { ...evidence, id: 'invalid', score: Number.NaN }], traces: [trace] },
    { name: 'trace', evidence: [evidence], traces: [trace, { ...trace, resultCount: -1 }] },
  ])('does not write any rows when $name is invalid', async (invalid) => {
    globalThis.IDBKeyRange = IDBKeyRange
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    const conversation = await repository.createConversation()
    const before = await readRecords(factory)

    await expect(repository.appendMessage({ id: 'invalid-answer', conversationId: conversation.id, role: 'user', content: '不应保存的新标题', status: 'complete', createdAt: '2026-09-08T00:00:00.000Z' }, invalid.evidence, invalid.traces)).rejects.toThrow()

    expect(await readRecords(factory)).toEqual(before)
  })

  it.each(['quota failure', 'transaction abort'])('rolls back all rows after %s and accepts the next write', async (failure) => {
    globalThis.IDBKeyRange = IDBKeyRange
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    const conversation = await repository.createConversation()
    const before = await readRecords(factory)
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'conversations' && failure === 'quota failure') throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
      const request = originalPut.call(this, value, key)
      if (this.name === 'conversations' && failure === 'transaction abort') request.addEventListener('success', () => this.transaction.abort())
      return request
    })
    const message = { id: 'failed-answer', conversationId: conversation.id, role: 'user' as const, content: '提交的新标题', status: 'complete' as const, createdAt: '2026-09-08T00:00:00.000Z' }

    await expect(repository.appendMessage(message, [evidence], [trace])).rejects.toThrow()
    put.mockRestore()
    expect(await readRecords(factory)).toEqual(before)

    await repository.appendMessage(message, [evidence], [trace])
    expect((await repository.loadConversation(conversation.id))?.messages).toHaveLength(1)
  })

  it('persists conversations, messages, evidence and public traces', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const repository = new AgentRepository(new IDBFactory())
    const conversation = await repository.createConversation('profile-1', 'model-a')
    await repository.appendMessage({ id: 'u1', conversationId: conversation.id, role: 'user', content: '棉悠悠适合做什么？', status: 'complete', createdAt: '2026-09-04T00:00:00.000Z', mentions: [{ kind: 'tool', name: 'get_pal_profile', label: '帕鲁资料', arguments: { pal: 'SheepBall' } }, { kind: 'entity', entityType: 'pal', id: 'SheepBall', label: '棉悠悠' }] })
    await repository.appendMessage({ id: 'a1', conversationId: conversation.id, role: 'assistant', content: '适合手工作业。', status: 'complete', createdAt: '2026-09-04T00:00:01.000Z' }, [{ id: 'pal:SheepBall', kind: 'pal', title: '棉悠悠', summary: '手工作业 Lv.1', matchedFields: ['工作适性'], score: 1, datasetVersion: 'v1' }], [{ tool: 'get_pal_profile', label: '读取棉悠悠', resultCount: 1, durationMs: 1, source: 'mention' }])
    const loaded = await repository.loadConversation(conversation.id)
    expect(loaded?.conversation.title).toBe('棉悠悠适合做什么？')
    expect(loaded?.conversation).toMatchObject({ profileId: 'profile-1', modelId: 'model-a' })
    expect(loaded?.messages).toHaveLength(2)
    expect(loaded?.messages[0].mentions).toHaveLength(2)
    expect(loaded?.messages[0].mentions?.[0]).toMatchObject({ kind: 'tool', arguments: { pal: 'SheepBall' } })
    expect(loaded?.messages[1].mentions).toEqual([])
    expect(loaded?.evidenceByMessage.a1[0].title).toBe('棉悠悠')
    expect(loaded?.tracesByMessage.a1[0].tool).toBe('get_pal_profile')
    expect(loaded?.tracesByMessage.a1[0].source).toBe('mention')
    await repository.deleteConversation(conversation.id)
    expect(await repository.listConversations()).toEqual([])
  })

  it('updates the connection and model target atomically', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const repository = new AgentRepository(new IDBFactory())
    const conversation = await repository.createConversation('profile-a', 'model-a')
    await repository.setConversationTarget(conversation.id, 'profile-b', 'model-b')
    expect((await repository.loadConversation(conversation.id))?.conversation).toMatchObject({
      profileId: 'profile-b',
      modelId: 'model-b',
    })
  })

  it('uses a mention label for an empty-message title and reads legacy rows without mentions', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const factory = new IDBFactory()
    const repository = new AgentRepository(factory)
    const mentionConversation = await repository.createConversation()
    await repository.appendMessage({
      id: 'mention-only',
      conversationId: mentionConversation.id,
      role: 'user',
      content: '',
      status: 'complete',
      createdAt: '2026-09-04T00:00:00.000Z',
      mentions: [{ kind: 'tool', name: 'get_pal_profile', label: '帕鲁资料', arguments: { pal: 'SheepBall' } }],
    })
    expect((await repository.loadConversation(mentionConversation.id))?.conversation.title).toBe('帕鲁资料')

    const legacyConversation = await repository.createConversation()
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(AGENT_DB_NAME, 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = database.transaction('messages', 'readwrite')
    transaction.objectStore('messages').put({ id: 'legacy', conversationId: legacyConversation.id, role: 'user', content: '旧消息', status: 'complete', createdAt: '2026-09-04T00:00:00.000Z' })
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error) })
    expect((await repository.loadConversation(legacyConversation.id))?.messages[0].mentions).toEqual([])
    const conversationTransaction = database.transaction('conversations', 'readwrite')
    conversationTransaction.objectStore('conversations').put({
      ...legacyConversation,
      modelId: undefined,
    })
    await new Promise<void>((resolve, reject) => { conversationTransaction.oncomplete = () => resolve(); conversationTransaction.onerror = () => reject(conversationTransaction.error) })
    expect((await repository.loadConversation(legacyConversation.id))?.conversation.modelId).toBe('')
    database.close()
  })
})
