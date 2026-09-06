const { app, ipcMain, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const {
  buildProviderStreamRequest,
  createProviderStreamAccumulator,
  parseProviderResponse,
} = require('../../build/electron/provider-protocol.cjs')

const PROFILE_FILE = 'agent-providers.json'
const activeRequests = new Map()
const sessionKeys = new Map()

function profilePath() { return path.join(app.getPath('userData'), PROFILE_FILE) }

async function readState() {
  try {
    const parsed = JSON.parse(await fs.readFile(profilePath(), 'utf8'))
    if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.profiles)) throw new Error('invalid profile state')
    return parsed
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.message !== 'invalid profile state') throw error
    return { schemaVersion: 1, defaultProfileId: '', profiles: [] }
  }
}

async function writeState(state) {
  const target = profilePath()
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
}

function validateUrl(rawUrl) {
  let url
  try { url = new URL(rawUrl) } catch { throw new Error('API 地址不是有效 URL') }
  if (url.username || url.password) throw new Error('API 地址不能包含用户名或密码')
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('API 地址必须使用 HTTPS；只有本机回环地址可以使用 HTTP')
  return url
}

function validateProfile(profile) {
  if (!profile || profile.schemaVersion !== 1 || typeof profile.id !== 'string' || !profile.id || typeof profile.model !== 'string' || !profile.model.trim()) throw new Error('模型配置不完整')
  if (!['openai-responses', 'openai-chat', 'anthropic-messages', 'gemini-generate-content'].includes(profile.transport)) throw new Error('不支持的模型协议')
  if (!['bearer', 'x-api-key', 'api-key', 'none'].includes(profile.authMode)) throw new Error('不支持的认证方式')
  if (!['auto', 'tools', 'retrieval-only'].includes(profile.capabilityMode)) throw new Error('不支持的能力模式')
  if (!Number.isInteger(profile.timeoutMs) || profile.timeoutMs < 5000 || profile.timeoutMs > 180000) throw new Error('请求超时范围无效')
  if (!Number.isInteger(profile.contextTurns) || profile.contextTurns < 1 || profile.contextTurns > 30) throw new Error('上下文轮数范围无效')
  if (JSON.stringify({ headers: profile.extraHeaders ?? {}, body: profile.extraBody ?? {} }).length > 100_000) throw new Error('高级请求参数超过 100 KB 安全上限')
  validateUrl(profile.baseUrl)
  const reservedHeaders = new Set(['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'origin', 'referer', 'x-api-key', 'x-goog-api-key', 'api-key', 'anthropic-version', 'content-type'])
  const reservedBody = new Set(['model', 'messages', 'input', 'contents', 'tools', 'tool_choice', 'stream', 'system', 'system_instruction', 'max_tokens', 'max_output_tokens', 'max_completion_tokens', 'temperature', 'top_p'])
  for (const key of Object.keys(profile.extraHeaders ?? {})) if (reservedHeaders.has(key.toLowerCase())) throw new Error(`额外请求头不能覆盖 ${key}`)
  for (const value of Object.values(profile.extraHeaders ?? {})) if (typeof value !== 'string') throw new Error('额外请求头的值必须是字符串')
  for (const key of Object.keys(profile.extraBody ?? {})) if (reservedBody.has(key)) throw new Error(`额外参数不能覆盖 ${key}`)
  return { ...profile, hasApiKey: undefined }
}

async function encryptionAvailable() {
  try { return await safeStorage.isAsyncEncryptionAvailable() } catch { return false }
}

async function decryptKey(row) {
  if (sessionKeys.has(row.profile.id)) return sessionKeys.get(row.profile.id)
  if (!row.encryptedKey || !(await encryptionAvailable())) return ''
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(row.encryptedKey, 'base64'))
  if (decrypted.shouldReEncrypt) {
    row.encryptedKey = (await safeStorage.encryptStringAsync(decrypted.result)).toString('base64')
  }
  return decrypted.result
}

function providerHttpError(status, detail) {
  const suffix = detail ? `：${detail}` : `（HTTP ${status}）`
  if (status === 401 || status === 403) return `模型服务认证失败，请检查 API Key、权限和模型${suffix}`
  if (status === 429) return `模型服务请求过于频繁或额度不足${suffix}`
  if (status >= 500) return `模型服务暂时不可用${suffix}`
  return `模型服务请求失败${suffix}`
}

async function consumeSse(stream, onPayload) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let totalBytes = 0
  const consumeBlock = (block) => { const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n'); if (!data || data === '[DONE]') return; try { onPayload(JSON.parse(data)) } catch (error) { if (error instanceof SyntaxError) throw new Error('模型服务返回了畸形流式事件'); throw error } }
  try { while (true) { const { done, value } = await reader.read(); if (done) break; totalBytes += value.byteLength; if (totalBytes > 2_000_000) throw new Error('模型响应超过 2 MB 安全上限'); buffer += decoder.decode(value, { stream: true }); const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? ''; for (const block of blocks) consumeBlock(block) } buffer += decoder.decode(); if (buffer.trim()) consumeBlock(buffer) } finally { reader.releaseLock() }
}

async function complete(profile, key, request, signal, emit) {
  const outgoing = buildProviderStreamRequest(profile, key, request)
  const requestBody = JSON.stringify(outgoing.body)
  if (requestBody.length > 1_000_000) throw new Error('模型请求超过 1 MB 安全上限')
  const response = await fetch(outgoing.url, { method: 'POST', headers: outgoing.headers, body: requestBody, signal, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) throw new Error('模型服务返回了未允许的重定向')
  if (response.ok && response.headers.get('content-type')?.includes('text/event-stream') && response.body) { const accumulator = createProviderStreamAccumulator(profile); await consumeSse(response.body, (payload) => { for (const streamEvent of accumulator.push(payload)) emit(streamEvent) }); return accumulator.result() }
  const text = await response.text()
  if (text.length > 2_000_000) throw new Error('模型响应超过 2 MB 安全上限')
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error(`模型服务返回了无法解析的内容（HTTP ${response.status}）`) }
  if (!response.ok) throw new Error(providerHttpError(response.status, payload?.error?.message))
  return parseProviderResponse(profile, payload)
}

function registerAgentGateway() {
  ipcMain.handle('paltools-agent:list-profiles', async () => {
    const state = await readState(); const available = await encryptionAvailable()
    const profiles = await Promise.all(state.profiles.map(async (row) => ({ ...row.profile, hasApiKey: row.profile.authMode === 'none' || Boolean(row.encryptedKey) || sessionKeys.has(row.profile.id) })))
    return { profiles, defaultProfileId: state.defaultProfileId, encryptionAvailable: available }
  })
  ipcMain.handle('paltools-agent:save-profile', async (_event, profileInput, apiKey) => {
    const profile = validateProfile(profileInput); const state = await readState(); const existing = state.profiles.find((row) => row.profile.id === profile.id)
    let encryptedKey = existing?.encryptedKey
    if (profile.authMode === 'none') { sessionKeys.delete(profile.id); encryptedKey = undefined }
    else if (typeof apiKey === 'string') {
      if (apiKey && await encryptionAvailable()) { encryptedKey = (await safeStorage.encryptStringAsync(apiKey)).toString('base64'); sessionKeys.delete(profile.id) }
      else if (apiKey) { sessionKeys.set(profile.id, apiKey); encryptedKey = undefined }
      else { sessionKeys.delete(profile.id); encryptedKey = undefined }
    }
    const row = { profile, ...(encryptedKey ? { encryptedKey } : {}) }
    state.profiles = [...state.profiles.filter((item) => item.profile.id !== profile.id), row]
    if (!state.defaultProfileId) state.defaultProfileId = profile.id
    await writeState(state)
  })
  ipcMain.handle('paltools-agent:remove-profile', async (_event, profileId) => { const state = await readState(); state.profiles = state.profiles.filter((row) => row.profile.id !== profileId); if (state.defaultProfileId === profileId) state.defaultProfileId = state.profiles[0]?.profile.id ?? ''; sessionKeys.delete(profileId); await writeState(state) })
  ipcMain.handle('paltools-agent:set-default-profile', async (_event, profileId) => { const state = await readState(); if (!state.profiles.some((row) => row.profile.id === profileId)) throw new Error('模型配置不存在'); state.defaultProfileId = profileId; await writeState(state) })
  ipcMain.handle('paltools-agent:complete', async (event, profileId, request, requestId) => {
    const state = await readState(); const row = state.profiles.find((item) => item.profile.id === profileId); if (!row) throw new Error('模型配置不存在')
    const profile = validateProfile(row.profile); const key = await decryptKey(row); if (profile.authMode !== 'none' && !key) throw new Error('API Key 不可用，请在设置中重新填写。')
    if (typeof requestId !== 'string' || !requestId) throw new Error('请求标识无效')
    if (!request || !Array.isArray(request.messages) || !Array.isArray(request.tools) || JSON.stringify(request).length > 1_000_000) throw new Error('模型请求无效或超过 1 MB 安全上限')
    const senderKey = `${event.sender.id}`; const requestKey = `${senderKey}:${requestId}`
    for (const [key, active] of activeRequests) if (key.startsWith(`${senderKey}:`)) active.abort('replaced')
    const controller = new AbortController(); activeRequests.set(requestKey, controller)
    const timeout = setTimeout(() => controller.abort('timeout'), profile.timeoutMs)
    const emit = (streamEvent) => { if (!event.sender.isDestroyed()) event.sender.send('paltools-agent:stream-event', requestId, streamEvent) }
    try { return await complete(profile, key, request, controller.signal, emit) } catch (error) { if (controller.signal.aborted) throw new Error(controller.signal.reason === 'timeout' ? '模型服务请求超时' : '已停止生成'); throw error } finally { clearTimeout(timeout); activeRequests.delete(requestKey) }
  })
  ipcMain.handle('paltools-agent:cancel', async (event, requestId) => { activeRequests.get(`${event.sender.id}:${requestId}`)?.abort('cancelled') })
}

module.exports = { registerAgentGateway }
