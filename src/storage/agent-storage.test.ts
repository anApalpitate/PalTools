// @vitest-environment jsdom

import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { AgentRepository } from './agent-storage'

describe('agent repository', () => {
  it('persists conversations, messages, evidence and public traces', async () => {
    globalThis.IDBKeyRange = IDBKeyRange
    const repository = new AgentRepository(new IDBFactory())
    const conversation = await repository.createConversation('profile-1')
    await repository.appendMessage({ id: 'u1', conversationId: conversation.id, role: 'user', content: '棉悠悠适合做什么？', status: 'complete', createdAt: '2026-09-04T00:00:00.000Z' })
    await repository.appendMessage({ id: 'a1', conversationId: conversation.id, role: 'assistant', content: '适合手工作业。', status: 'complete', createdAt: '2026-09-04T00:00:01.000Z' }, [{ id: 'pal:SheepBall', kind: 'pal', title: '棉悠悠', summary: '手工作业 Lv.1', matchedFields: ['工作适性'], score: 1, datasetVersion: 'v1' }], [{ tool: 'get_pal_profile', label: '读取棉悠悠', resultCount: 1, durationMs: 1 }])
    const loaded = await repository.loadConversation(conversation.id)
    expect(loaded?.conversation.title).toBe('棉悠悠适合做什么？')
    expect(loaded?.messages).toHaveLength(2)
    expect(loaded?.evidenceByMessage.a1[0].title).toBe('棉悠悠')
    expect(loaded?.tracesByMessage.a1[0].tool).toBe('get_pal_profile')
    await repository.deleteConversation(conversation.id)
    expect(await repository.listConversations()).toEqual([])
  })
})
