// @vitest-environment jsdom

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { AGENT_DB_NAME, AgentRepository } from './agent-storage'

describe('agent repository', () => {
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
