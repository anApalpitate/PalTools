import { z } from 'zod'
import {
  assistantMentionsSchema,
  localToolNameSchema,
  localToolTraceSourceSchema,
  type AssistantMentionV1,
  type KnowledgeEvidence,
  type LocalToolTrace,
} from '../domain/knowledge'

export const AGENT_DB_NAME = 'paltools-agent'
const DATABASE_VERSION = 1

export interface AgentConversation {
  id: string
  title: string
  profileId: string
  createdAt: string
  updatedAt: string
}

export interface AgentMessage {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  status: 'complete' | 'error'
  createdAt: string
  providerName?: string
  model?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  mentions?: AssistantMentionV1[]
}

interface EvidenceRow extends KnowledgeEvidence { messageId: string }
interface TraceRow extends LocalToolTrace { id: string; messageId: string }

export interface AgentConversationBundle {
  conversation: AgentConversation
  messages: AgentMessage[]
  evidenceByMessage: Record<string, KnowledgeEvidence[]>
  tracesByMessage: Record<string, LocalToolTrace[]>
}

const conversationSchema = z.object({ id: z.string().min(1), title: z.string().min(1), profileId: z.string(), createdAt: z.string().datetime(), updatedAt: z.string().datetime() })
const messageSchema = z.object({ id: z.string().min(1), conversationId: z.string().min(1), role: z.enum(['user', 'assistant']), content: z.string(), status: z.enum(['complete', 'error']), createdAt: z.string().datetime(), providerName: z.string().optional(), model: z.string().optional(), usage: z.object({ inputTokens: z.number().optional(), outputTokens: z.number().optional(), totalTokens: z.number().optional() }).optional(), mentions: assistantMentionsSchema.optional().default([]) })
const evidenceRowSchema = z.object({ messageId: z.string().min(1), id: z.string().min(1), kind: z.enum(['pal', 'skill', 'passive', 'item', 'recipe']), title: z.string(), summary: z.string(), matchedFields: z.array(z.string()), score: z.number(), route: z.string().optional(), imagePath: z.string().optional(), datasetVersion: z.string() })
const traceRowSchema = z.object({ id: z.string().min(1), messageId: z.string().min(1), tool: localToolNameSchema, label: z.string(), resultCount: z.number().int().nonnegative(), durationMs: z.number().nonnegative(), source: localToolTraceSourceSchema.optional() })

export class AgentStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = 'AgentStorageError' }
}

export class AgentRepository {
  private readonly databasePromise: Promise<IDBDatabase>

  constructor(factory: IDBFactory = indexedDB) { this.databasePromise = openDatabase(factory) }

  async listConversations(): Promise<AgentConversation[]> {
    const db = await this.databasePromise
    const transaction = db.transaction('conversations', 'readonly')
    const values = await requestToPromise(transaction.objectStore('conversations').getAll())
    await transactionDone(transaction)
    try { return (values as unknown[]).map((value) => conversationSchema.parse(value)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)) }
    catch (error) { throw new AgentStorageError('本地对话档案已损坏，请清空后重试。', { cause: error }) }
  }

  async createConversation(profileId = ''): Promise<AgentConversation> {
    const now = new Date().toISOString()
    const conversation: AgentConversation = { id: crypto.randomUUID(), title: '新的研究记录', profileId, createdAt: now, updatedAt: now }
    const db = await this.databasePromise
    const transaction = db.transaction('conversations', 'readwrite')
    transaction.objectStore('conversations').add(conversation)
    await transactionDone(transaction)
    return conversation
  }

  async loadConversation(id: string): Promise<AgentConversationBundle | null> {
    const db = await this.databasePromise
    const transaction = db.transaction(['conversations', 'messages', 'evidence', 'traces'], 'readonly')
    const conversation = await requestToPromise(transaction.objectStore('conversations').get(id))
    if (!conversation) { await transactionDone(transaction); return null }
    const messages = await getAllByIndex(transaction.objectStore('messages'), 'conversationId', id)
    const messageIds = new Set((messages as AgentMessage[]).map((message) => message.id))
    const allEvidence = await requestToPromise(transaction.objectStore('evidence').getAll()) as EvidenceRow[]
    const allTraces = await requestToPromise(transaction.objectStore('traces').getAll()) as TraceRow[]
    await transactionDone(transaction)
    try {
      const parsedConversation = conversationSchema.parse(conversation)
      const parsedMessages = (messages as unknown[]).map((value) => messageSchema.parse(value)).sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      const parsedEvidence = allEvidence.filter((row) => messageIds.has(row.messageId)).map((row) => evidenceRowSchema.parse(row))
      const parsedTraces = allTraces.filter((row) => messageIds.has(row.messageId)).map((row) => traceRowSchema.parse(row))
      return {
        conversation: parsedConversation,
        messages: parsedMessages,
        evidenceByMessage: groupRows(parsedEvidence),
        tracesByMessage: groupRows(parsedTraces),
      }
    } catch (error) { throw new AgentStorageError('这份研究记录已损坏，请删除后重新创建。', { cause: error }) }
  }

  async appendMessage(message: AgentMessage, evidence: KnowledgeEvidence[] = [], traces: LocalToolTrace[] = []): Promise<void> {
    const parsedMessage = messageSchema.parse(message)
    const db = await this.databasePromise
    const transaction = db.transaction(['conversations', 'messages', 'evidence', 'traces'], 'readwrite')
    const conversations = transaction.objectStore('conversations')
    const conversation = await requestToPromise(conversations.get(parsedMessage.conversationId)) as AgentConversation | undefined
    if (!conversation) { transaction.abort(); throw new AgentStorageError('研究记录不存在。') }
    transaction.objectStore('messages').put(parsedMessage)
    for (const item of evidence) transaction.objectStore('evidence').put(evidenceRowSchema.parse({ ...item, messageId: parsedMessage.id }))
    traces.forEach((trace, index) => transaction.objectStore('traces').put(traceRowSchema.parse({ ...trace, id: `${parsedMessage.id}:${index}`, messageId: parsedMessage.id })))
    const generatedTitle = parsedMessage.content.trim().slice(0, 24) || parsedMessage.mentions[0]?.label
    conversations.put({ ...conversation, title: conversation.title === '新的研究记录' && parsedMessage.role === 'user' ? generatedTitle || conversation.title : conversation.title, updatedAt: parsedMessage.createdAt })
    await transactionDone(transaction)
  }

  async renameConversation(id: string, title: string): Promise<void> {
    const clean = title.trim().slice(0, 40)
    if (!clean) throw new AgentStorageError('记录名称不能为空。')
    await this.updateConversation(id, (conversation) => ({ ...conversation, title: clean, updatedAt: new Date().toISOString() }))
  }

  async setConversationProfile(id: string, profileId: string): Promise<void> {
    await this.updateConversation(id, (conversation) => ({ ...conversation, profileId, updatedAt: new Date().toISOString() }))
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.databasePromise
    const transaction = db.transaction(['conversations', 'messages', 'evidence', 'traces'], 'readwrite')
    transaction.objectStore('conversations').delete(id)
    const messages = await getAllByIndex(transaction.objectStore('messages'), 'conversationId', id) as AgentMessage[]
    for (const message of messages) {
      transaction.objectStore('messages').delete(message.id)
      await deleteByIndex(transaction.objectStore('evidence'), 'messageId', message.id)
      await deleteByIndex(transaction.objectStore('traces'), 'messageId', message.id)
    }
    await transactionDone(transaction)
  }

  async clear(): Promise<void> {
    const db = await this.databasePromise
    const transaction = db.transaction(['conversations', 'messages', 'evidence', 'traces'], 'readwrite')
    for (const name of ['conversations', 'messages', 'evidence', 'traces']) transaction.objectStore(name).clear()
    await transactionDone(transaction)
  }

  private async updateConversation(id: string, update: (conversation: AgentConversation) => AgentConversation) {
    const db = await this.databasePromise
    const transaction = db.transaction('conversations', 'readwrite')
    const store = transaction.objectStore('conversations')
    const conversation = await requestToPromise(store.get(id)) as AgentConversation | undefined
    if (!conversation) { transaction.abort(); throw new AgentStorageError('研究记录不存在。') }
    store.put(update(conversation)); await transactionDone(transaction)
  }
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(AGENT_DB_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('conversations')) db.createObjectStore('conversations', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('messages')) { const store = db.createObjectStore('messages', { keyPath: 'id' }); store.createIndex('conversationId', 'conversationId') }
      if (!db.objectStoreNames.contains('evidence')) { const store = db.createObjectStore('evidence', { keyPath: ['messageId', 'id'] }); store.createIndex('messageId', 'messageId') }
      if (!db.objectStoreNames.contains('traces')) { const store = db.createObjectStore('traces', { keyPath: 'id' }); store.createIndex('messageId', 'messageId') }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error) }) }
function transactionDone(transaction: IDBTransaction): Promise<void> { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error ?? new Error('transaction aborted')) }) }
function getAllByIndex(store: IDBObjectStore, index: string, value: string): Promise<unknown[]> { return requestToPromise(store.index(index).getAll(IDBKeyRange.only(value))) }
function deleteByIndex(store: IDBObjectStore, index: string, value: string): Promise<void> { return new Promise((resolve, reject) => { const request = store.index(index).openKeyCursor(IDBKeyRange.only(value)); request.onerror = () => reject(request.error); request.onsuccess = () => { const cursor = request.result; if (!cursor) { resolve(); return } store.delete(cursor.primaryKey); cursor.continue() } }) }
function groupRows<T extends { messageId: string }>(rows: T[]): Record<string, T[]> { return rows.reduce<Record<string, T[]>>((groups, row) => { (groups[row.messageId] ??= []).push(row); return groups }, {}) }
