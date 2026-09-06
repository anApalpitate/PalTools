import type { ProviderProfileV1 } from '../domain/agent'
import { providerProfileSchema, validateProviderProfile } from '../domain/agent'
import { buildProviderStreamRequest, createProviderStreamAccumulator, parseProviderResponse } from '../domain/provider-adapters'
import type { AgentModelRequest, AgentModelResult, AgentStreamEvent } from '../domain/provider-adapters'

const WEB_PROFILES_KEY = 'paltools.agent-profiles.v1'
const WEB_DEFAULT_PROFILE_KEY = 'paltools.agent-default-profile.v1'
const MAX_RESPONSE_BYTES = 2_000_000
const webKeys = new Map<string, string>()

export interface AgentElectronBridge {
  listProfiles(): Promise<{ profiles: ProviderProfileV1[]; defaultProfileId: string; encryptionAvailable: boolean; managedProfileIds?: string[]; developmentProfileError?: string; sessionDefaultProfileId?: string }>
  saveProfile(profile: ProviderProfileV1, apiKey?: string): Promise<void>
  removeProfile(profileId: string): Promise<void>
  setDefaultProfile(profileId: string): Promise<void>
  complete(profileId: string, request: AgentModelRequest, requestId: string): Promise<AgentModelResult>
  cancel(requestId: string): Promise<void>
  subscribe(listener: (requestId: string, event: AgentStreamEvent) => void): () => void
}

declare global {
  interface Window { paltoolsAgent?: AgentElectronBridge }
}

export interface ProviderSnapshot {
  profiles: ProviderProfileV1[]
  defaultProfileId: string
  encryptionAvailable: boolean
  managedProfileIds: string[]
  developmentProfileError?: string
  sessionDefaultProfileId?: string
  platform: 'electron' | 'web'
}

export class ProviderService {
  readonly platform = window.paltoolsAgent ? 'electron' : 'web'

  async load(): Promise<ProviderSnapshot> {
    if (window.paltoolsAgent) {
      const snapshot = await window.paltoolsAgent.listProfiles()
      return { ...snapshot, managedProfileIds: snapshot.managedProfileIds ?? [], platform: 'electron' }
    }
    let profiles: ProviderProfileV1[] = []
    try {
      const parsed = JSON.parse(localStorage.getItem(WEB_PROFILES_KEY) ?? '[]') as unknown[]
      profiles = parsed.map((value) => providerProfileSchema.parse(value)).map((profile) => ({ ...profile, hasApiKey: webKeys.has(profile.id) }))
    } catch { localStorage.removeItem(WEB_PROFILES_KEY) }
    return { profiles, defaultProfileId: localStorage.getItem(WEB_DEFAULT_PROFILE_KEY) ?? '', encryptionAvailable: false, managedProfileIds: [], platform: 'web' }
  }

  async save(profile: ProviderProfileV1, apiKey?: string): Promise<void> {
    const safeProfile = validateProviderProfile({ ...profile, hasApiKey: undefined })
    const current = await this.load()
    const existing = current.profiles.find((item) => item.id === safeProfile.id)
    const credentialScopeChanged = existing !== undefined && (
      existing.baseUrl !== safeProfile.baseUrl
      || existing.transport !== safeProfile.transport
      || existing.authMode !== safeProfile.authMode
    )
    const scopedApiKey = credentialScopeChanged && apiKey === undefined ? '' : apiKey
    if (window.paltoolsAgent) return window.paltoolsAgent.saveProfile(safeProfile, scopedApiKey)
    const next = [...current.profiles.filter((item) => item.id !== safeProfile.id), safeProfile]
    localStorage.setItem(WEB_PROFILES_KEY, JSON.stringify(next.map(({ hasApiKey: _hasApiKey, ...item }) => item)))
    if (safeProfile.authMode === 'none' || scopedApiKey === '') webKeys.delete(safeProfile.id)
    else if (scopedApiKey !== undefined) webKeys.set(safeProfile.id, scopedApiKey)
    if (!current.defaultProfileId) localStorage.setItem(WEB_DEFAULT_PROFILE_KEY, safeProfile.id)
  }

  async remove(profileId: string): Promise<void> {
    if (window.paltoolsAgent) return window.paltoolsAgent.removeProfile(profileId)
    const current = await this.load()
    localStorage.setItem(WEB_PROFILES_KEY, JSON.stringify(current.profiles.filter((profile) => profile.id !== profileId).map(({ hasApiKey: _hasApiKey, ...item }) => item)))
    webKeys.delete(profileId)
    if (current.defaultProfileId === profileId) localStorage.setItem(WEB_DEFAULT_PROFILE_KEY, current.profiles.find((profile) => profile.id !== profileId)?.id ?? '')
  }

  async setDefault(profileId: string): Promise<void> {
    if (window.paltoolsAgent) return window.paltoolsAgent.setDefaultProfile(profileId)
    localStorage.setItem(WEB_DEFAULT_PROFILE_KEY, profileId)
  }

  async complete(profile: ProviderProfileV1, request: AgentModelRequest, signal?: AbortSignal, onEvent?: (event: AgentStreamEvent) => void): Promise<AgentModelResult> {
    if (signal?.aborted) throw new Error('已停止生成')
    if (window.paltoolsAgent) {
      const requestId = crypto.randomUUID()
      const unsubscribe = window.paltoolsAgent.subscribe((eventRequestId, event) => {
        if (eventRequestId === requestId) onEvent?.(event)
      })
      const abort = () => void window.paltoolsAgent?.cancel(requestId)
      signal?.addEventListener('abort', abort, { once: true })
      try { return await window.paltoolsAgent.complete(profile.id, request, requestId) }
      finally { unsubscribe(); signal?.removeEventListener('abort', abort) }
    }
    const key = webKeys.get(profile.id) ?? ''
    if (profile.authMode !== 'none' && !key) throw new Error('Web 版 API Key 只保留在当前页面，请重新填写密钥。')
    const outgoing = buildProviderStreamRequest(profile, key, request)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort('timeout'), profile.timeoutMs)
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const requestBody = JSON.stringify(outgoing.body)
      if (requestBody.length > 1_000_000) throw new Error('模型请求超过 1 MB 安全上限')
      const response = await fetch(outgoing.url, { method: 'POST', headers: outgoing.headers, body: requestBody, signal: controller.signal, redirect: 'error' })
      await rejectOversizedDeclaredResponse(response)
      if (!response.ok) {
        await readBoundedResponseText(response)
        throw new Error(providerHttpError(response.status))
      }
      if (response.headers.get('content-type')?.includes('text/event-stream') && response.body) {
        const accumulator = createProviderStreamAccumulator(profile)
        await consumeSse(response.body, (payload) => {
          for (const event of accumulator.push(payload)) onEvent?.(event)
        })
        return accumulator.result()
      }
      const text = await readBoundedResponseText(response)
      let payload: unknown
      try { payload = JSON.parse(text) } catch { throw new Error(`模型服务返回了无法解析的内容（HTTP ${response.status}）`) }
      return parseProviderResponse(profile, payload)
    } catch (error) {
      if (controller.signal.aborted) throw new Error(signal?.aborted ? '已停止生成' : '模型服务请求超时')
      if (error instanceof TypeError) throw new Error('浏览器无法连接该 API。请检查地址、CORS 设置或改用桌面版。')
      throw safeProviderFailure(error)
    } finally {
      clearTimeout(timeout); signal?.removeEventListener('abort', abort)
    }
  }

  async test(profile: ProviderProfileV1): Promise<AgentModelResult> {
    const allowTools = profile.capabilityMode !== 'retrieval-only'
    return this.complete(profile, {
      allowTools,
      tools: allowTools ? [{ name: 'search_local_knowledge', description: '连接测试占位工具；不要调用。', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } }] : [],
      messages: [{ role: 'system', content: '这是连接测试。不要调用工具，只回复 OK。' }, { role: 'user', content: '连接测试' }],
    })
  }
}

function providerHttpError(status: number): string {
  const suffix = `（HTTP ${status}）`
  if (status === 401 || status === 403) return `模型服务认证失败，请检查 API Key、权限和模型${suffix}`
  if (status === 429) return `模型服务请求过于频繁或额度不足${suffix}`
  if (status >= 500) return `模型服务暂时不可用${suffix}`
  return `模型服务请求失败${suffix}`
}

function safeProviderFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : ''
  if (
    message === '模型请求超过 1 MB 安全上限'
    || message === '模型响应超过 2 MB 安全上限'
    || message === '模型服务返回了畸形流式事件'
    || /^模型服务返回了无法解析的内容（HTTP \d{3}）$/.test(message)
    || /^模型服务(?:认证失败，请检查 API Key、权限和模型|请求过于频繁或额度不足|暂时不可用|请求失败)（HTTP \d{3}）$/.test(message)
  ) return new Error(message)
  return new Error('模型服务返回错误，请检查服务配置或稍后重试。')
}

async function rejectOversizedDeclaredResponse(response: Response): Promise<void> {
  const declared = response.headers.get('content-length')?.trim() ?? ''
  if (!/^\d+$/.test(declared) || Number(declared) <= MAX_RESPONSE_BYTES) return
  try { await response.body?.cancel() } catch { /* preserve the size-limit failure */ }
  throw new Error('模型响应超过 2 MB 安全上限')
}

async function readBoundedResponseText(response: Response): Promise<string> {
  await rejectOversizedDeclaredResponse(response)
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        try { await reader.cancel() } catch { /* preserve the size-limit failure */ }
        throw new Error('模型响应超过 2 MB 安全上限')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

async function consumeSse(stream: ReadableStream<Uint8Array>, onPayload: (payload: unknown) => void): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let totalBytes = 0
  const consumeBlock = (block: string) => {
    const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n')
    if (!data || data === '[DONE]') return
    try { onPayload(JSON.parse(data)) } catch { throw new Error('模型服务返回了畸形流式事件') }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        try { await reader.cancel() } catch { /* preserve the size-limit failure */ }
        throw new Error('模型响应超过 2 MB 安全上限')
      }
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) consumeBlock(block)
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeBlock(buffer)
  } finally {
    reader.releaseLock()
  }
}
