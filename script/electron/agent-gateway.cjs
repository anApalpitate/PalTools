const { app, ipcMain, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const {
  buildProviderStreamRequest,
  createProviderStreamAccumulator,
  parseProviderResponse,
} = require('../../build/electron/provider-protocol.cjs')

const PROFILE_FILE = 'agent-providers.json'
const DEVELOPMENT_PROFILE_ID = 'paltools-managed-development-deepseek'
const MAX_ENCRYPTED_KEY_BYTES = 64 * 1024
const MAX_RESPONSE_BYTES = 2_000_000
const activeRequests = new Map()
const sessionKeys = new Map()
let developmentProfilePromise
let sessionDefaultProfileId = ''

function profilePath() { return path.join(app.getPath('userData'), PROFILE_FILE) }

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function sanitizeJsonValue(value, seen = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (depth > 30 || (!Array.isArray(value) && !isPlainRecord(value))) throw new Error('额外参数必须是 JSON 值')
  if (seen.has(value)) throw new Error('额外参数不能循环引用')
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => sanitizeJsonValue(item, seen, depth + 1))
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeJsonValue(item, seen, depth + 1)]))
  } finally {
    seen.delete(value)
  }
}

function sanitizeState(parsed) {
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.profiles)) throw new Error('invalid profile state')
  const profiles = []
  for (const row of parsed.profiles) {
    try {
      const profile = validateProfile(row?.profile)
      const encryptedKey = typeof row?.encryptedKey === 'string' && row.encryptedKey.length <= MAX_ENCRYPTED_KEY_BYTES ? row.encryptedKey : undefined
      profiles.push({ profile, ...(encryptedKey ? { encryptedKey } : {}) })
    } catch {
      // Ignore malformed rows while retaining the remaining usable profiles.
    }
  }
  const defaultCandidate = typeof parsed.defaultProfileId === 'string' && parsed.defaultProfileId.length <= 100 ? parsed.defaultProfileId : ''
  const defaultProfileId = profiles.some((row) => row.profile.id === defaultCandidate) ? defaultCandidate : ''
  return { schemaVersion: 1, defaultProfileId, profiles }
}

async function readState() {
  try {
    const parsed = JSON.parse(await fs.readFile(profilePath(), 'utf8'))
    const state = sanitizeState(parsed)
    if (JSON.stringify(parsed) !== JSON.stringify(state)) await writeState(state)
    return state
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.message !== 'invalid profile state' && !(error instanceof SyntaxError)) throw error
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
  if (!profile || profile.schemaVersion !== 1 || typeof profile.id !== 'string' || !profile.id || profile.id.length > 100) throw new Error('模型配置不完整')
  if (typeof profile.presetId !== 'string' || !profile.presetId || profile.presetId.length > 100) throw new Error('模型配置不完整')
  if (typeof profile.displayName !== 'string' || !profile.displayName.trim() || profile.displayName.trim().length > 80) throw new Error('模型配置不完整')
  if (typeof profile.baseUrl !== 'string' || !profile.baseUrl.trim() || profile.baseUrl.trim().length > 500) throw new Error('模型配置不完整')
  if (typeof profile.model !== 'string' || !profile.model.trim() || profile.model.trim().length > 200) throw new Error('模型配置不完整')
  if (!['openai-responses', 'openai-chat', 'anthropic-messages', 'gemini-generate-content'].includes(profile.transport)) throw new Error('不支持的模型协议')
  if (!['bearer', 'x-api-key', 'api-key', 'none'].includes(profile.authMode)) throw new Error('不支持的认证方式')
  if (!['auto', 'tools', 'retrieval-only'].includes(profile.capabilityMode)) throw new Error('不支持的能力模式')
  if (profile.temperature !== undefined && (!Number.isFinite(profile.temperature) || profile.temperature < 0 || profile.temperature > 2)) throw new Error('温度参数范围无效')
  if (profile.topP !== undefined && (!Number.isFinite(profile.topP) || profile.topP < 0 || profile.topP > 1)) throw new Error('Top P 参数范围无效')
  if (profile.maxOutputTokens !== undefined && (!Number.isInteger(profile.maxOutputTokens) || profile.maxOutputTokens < 1 || profile.maxOutputTokens > 128000)) throw new Error('输出上限范围无效')
  if (!Number.isInteger(profile.timeoutMs) || profile.timeoutMs < 5000 || profile.timeoutMs > 180000) throw new Error('请求超时范围无效')
  if (!Number.isInteger(profile.contextTurns) || profile.contextTurns < 1 || profile.contextTurns > 30) throw new Error('上下文轮数范围无效')
  if (!isPlainRecord(profile.extraHeaders) || !isPlainRecord(profile.extraBody)) throw new Error('高级请求参数必须是对象')
  const extraHeaders = Object.fromEntries(Object.entries(profile.extraHeaders))
  const extraBody = sanitizeJsonValue(profile.extraBody)
  if (JSON.stringify({ headers: extraHeaders, body: extraBody }).length > 100_000) throw new Error('高级请求参数超过 100 KB 安全上限')
  const baseUrl = profile.baseUrl.trim()
  validateUrl(baseUrl)
  const reservedHeaders = new Set(['authorization', 'proxy-authorization', 'host', 'cookie', 'content-length', 'origin', 'referer', 'x-api-key', 'x-goog-api-key', 'api-key', 'anthropic-version', 'content-type'])
  const reservedBody = new Set(['model', 'messages', 'input', 'contents', 'tools', 'tool_choice', 'stream', 'system', 'system_instruction', 'max_tokens', 'max_output_tokens', 'max_completion_tokens', 'temperature', 'top_p'])
  for (const key of Object.keys(extraHeaders)) if (reservedHeaders.has(key.toLowerCase())) throw new Error(`额外请求头不能覆盖 ${key}`)
  for (const value of Object.values(extraHeaders)) if (typeof value !== 'string') throw new Error('额外请求头的值必须是字符串')
  for (const key of Object.keys(extraBody)) if (reservedBody.has(key)) throw new Error(`额外参数不能覆盖 ${key}`)
  return {
    schemaVersion: 1,
    id: profile.id,
    presetId: profile.presetId,
    displayName: profile.displayName.trim(),
    transport: profile.transport,
    baseUrl,
    model: profile.model.trim(),
    authMode: profile.authMode,
    ...(profile.temperature !== undefined ? { temperature: profile.temperature } : {}),
    ...(profile.topP !== undefined ? { topP: profile.topP } : {}),
    ...(profile.maxOutputTokens !== undefined ? { maxOutputTokens: profile.maxOutputTokens } : {}),
    timeoutMs: profile.timeoutMs,
    contextTurns: profile.contextTurns,
    capabilityMode: profile.capabilityMode,
    extraHeaders,
    extraBody,
  }
}

async function encryptionAvailable() {
  try { return await safeStorage.isAsyncEncryptionAvailable() } catch { return false }
}

async function decryptKey(row) {
  if (sessionKeys.has(row.profile.id)) return { key: sessionKeys.get(row.profile.id) }
  if (!row.encryptedKey || !(await encryptionAvailable())) return { key: '' }
  const decrypted = await safeStorage.decryptStringAsync(Buffer.from(row.encryptedKey, 'base64'))
  const reEncryptedKey = decrypted.shouldReEncrypt
    ? (await safeStorage.encryptStringAsync(decrypted.result)).toString('base64')
    : undefined
  return { key: decrypted.result, reEncryptedKey }
}

function developmentProviderEnabled() {
  return !app.isPackaged &&
    process.env.PALTOOLS_SMOKE_TEST !== '1' &&
    !process.argv.includes('--paltools-smoke-test') &&
    !app.commandLine.hasSwitch('paltools-smoke-test')
}

async function getDevelopmentProfile() {
  if (!developmentProviderEnabled()) return null
  if (developmentProfilePromise) return developmentProfilePromise
  const pending = Promise.resolve().then(async () => {
    const { loadDevelopmentProvider } = require('../development/dev-provider.cjs')
    const loaded = await loadDevelopmentProvider().catch((error) => {
      if (!process.env.PALTOOLS_DEV_API_PATH?.trim() && error?.code === 'PALTOOLS_DEV_PROVIDER_MISSING') return null
      throw error
    })
    if (!loaded) return null
    const profile = validateProfile(loaded.profile)
    if (profile.id !== DEVELOPMENT_PROFILE_ID) throw new Error('开发者 API 配置标识无效')
    sessionKeys.set(profile.id, loaded.apiKey)
    return profile
  })
  developmentProfilePromise = pending
  try {
    const profile = await pending
    if (!profile && developmentProfilePromise === pending) developmentProfilePromise = undefined
    return profile
  } catch (error) {
    if (developmentProfilePromise === pending) developmentProfilePromise = undefined
    throw error
  }
}

function developmentProfileFailure(error) {
  if (error instanceof Error && error.message.startsWith('开发者 API 配置')) return error.message
  return '开发者 API 配置加载失败'
}

async function getDevelopmentProfileState() {
  try { return { profile: await getDevelopmentProfile(), error: '' } }
  catch (error) { return { profile: null, error: developmentProfileFailure(error) } }
}

function providerHttpError(status) {
  const suffix = `（HTTP ${status}）`
  if (status === 401 || status === 403) return `模型服务认证失败，请检查 API Key、权限和模型${suffix}`
  if (status === 429) return `模型服务请求过于频繁或额度不足${suffix}`
  if (status >= 500) return `模型服务暂时不可用${suffix}`
  return `模型服务请求失败${suffix}`
}

function safeProviderFailure(error) {
  const message = error instanceof Error ? error.message : ''
  if (
    message === '模型请求超过 1 MB 安全上限' ||
    message === '模型响应超过 2 MB 安全上限' ||
    message === '模型服务返回了未允许的重定向' ||
    message === '模型服务返回了畸形流式事件' ||
    /^模型服务返回了无法解析的内容（HTTP \d{3}）$/.test(message) ||
    /^模型服务(?:认证失败，请检查 API Key、权限和模型|请求过于频繁或额度不足|暂时不可用|请求失败)（HTTP \d{3}）$/.test(message)
  ) return new Error(message)
  return new Error('模型服务返回错误，请检查服务配置或稍后重试。')
}

async function rejectOversizedDeclaredResponse(response) {
  const declared = response.headers.get('content-length')?.trim() ?? ''
  if (!/^\d+$/.test(declared) || Number(declared) <= MAX_RESPONSE_BYTES) return
  try { await response.body?.cancel() } catch { /* preserve the size-limit failure */ }
  throw new Error('模型响应超过 2 MB 安全上限')
}

async function readBoundedResponseText(response) {
  await rejectOversizedDeclaredResponse(response)
  if (!response.body) return ''
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let text = ''; let totalBytes = 0
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

async function consumeSse(stream, onPayload) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let totalBytes = 0
  const consumeBlock = (block) => { const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n'); if (!data || data === '[DONE]') return; try { onPayload(JSON.parse(data)) } catch (error) { if (error instanceof SyntaxError) throw new Error('模型服务返回了畸形流式事件'); throw error } }
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_RESPONSE_BYTES) {
        try { await reader.cancel() } catch { /* preserve the size-limit failure */ }
        throw new Error('模型响应超过 2 MB 安全上限')
      }
      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? ''
      for (const block of blocks) consumeBlock(block)
    }
    buffer += decoder.decode(); if (buffer.trim()) consumeBlock(buffer)
  } finally { reader.releaseLock() }
}

async function complete(profile, key, request, signal, emit) {
  const outgoing = buildProviderStreamRequest(profile, key, request)
  const requestBody = JSON.stringify(outgoing.body)
  if (requestBody.length > 1_000_000) throw new Error('模型请求超过 1 MB 安全上限')
  const response = await fetch(outgoing.url, { method: 'POST', headers: outgoing.headers, body: requestBody, signal, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    try { await response.body?.cancel() } catch { /* preserve the redirect failure */ }
    throw new Error('模型服务返回了未允许的重定向')
  }
  await rejectOversizedDeclaredResponse(response)
  if (response.ok && response.headers.get('content-type')?.includes('text/event-stream') && response.body) { const accumulator = createProviderStreamAccumulator(profile); await consumeSse(response.body, (payload) => { for (const streamEvent of accumulator.push(payload)) emit(streamEvent) }); return accumulator.result() }
  const text = await readBoundedResponseText(response)
  if (!response.ok) throw new Error(providerHttpError(response.status))
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error(`模型服务返回了无法解析的内容（HTTP ${response.status}）`) }
  return parseProviderResponse(profile, payload)
}

function registerAgentGateway() {
  ipcMain.handle('paltools-agent:list-profiles', async () => {
    const state = await readState(); const available = await encryptionAvailable(); const developmentState = await getDevelopmentProfileState(); const developmentProfile = developmentState.profile
    const storedRows = state.profiles.filter((row) => row.profile.id !== developmentProfile?.id)
    const storedProfiles = await Promise.all(storedRows.map(async (row) => ({ ...row.profile, hasApiKey: row.profile.authMode === 'none' || Boolean(row.encryptedKey) || sessionKeys.has(row.profile.id) })))
    const profiles = developmentProfile ? [{ ...developmentProfile, hasApiKey: sessionKeys.has(developmentProfile.id) }, ...storedProfiles] : storedProfiles
    const storedDefaultExists = storedRows.some((row) => row.profile.id === state.defaultProfileId)
    const sessionDefaultExists = profiles.some((profile) => profile.id === sessionDefaultProfileId)
    const defaultProfileId = sessionDefaultExists ? sessionDefaultProfileId : (storedDefaultExists ? state.defaultProfileId : developmentProfile?.id ?? state.defaultProfileId)
    return {
      profiles,
      defaultProfileId,
      encryptionAvailable: available,
      managedProfileIds: developmentProfile ? [developmentProfile.id] : [],
      ...(developmentState.error ? { developmentProfileError: developmentState.error } : {}),
      ...(sessionDefaultExists ? { sessionDefaultProfileId } : {}),
    }
  })
  ipcMain.handle('paltools-agent:save-profile', async (_event, profileInput, apiKey) => {
    if (developmentProviderEnabled() && profileInput?.id === DEVELOPMENT_PROFILE_ID) throw new Error('开发者默认模型配置由本地文件托管，不能保存。')
    const profile = validateProfile(profileInput); const state = await readState(); const existing = state.profiles.find((row) => row.profile.id === profile.id)
    const credentialScopeChanged = Boolean(existing && (
      existing.profile.baseUrl !== profile.baseUrl ||
      existing.profile.transport !== profile.transport ||
      existing.profile.authMode !== profile.authMode
    ))
    const keyInput = typeof apiKey === 'string' ? apiKey : undefined
    let encryptedKey = existing?.encryptedKey
    if (profile.authMode === 'none') { sessionKeys.delete(profile.id); encryptedKey = undefined }
    else if (keyInput !== undefined || credentialScopeChanged) {
      const nextKey = keyInput ?? ''
      if (nextKey && await encryptionAvailable()) { encryptedKey = (await safeStorage.encryptStringAsync(nextKey)).toString('base64'); sessionKeys.delete(profile.id) }
      else if (nextKey) { sessionKeys.set(profile.id, nextKey); encryptedKey = undefined }
      else { sessionKeys.delete(profile.id); encryptedKey = undefined }
    }
    const row = { profile, ...(encryptedKey ? { encryptedKey } : {}) }
    state.profiles = [...state.profiles.filter((item) => item.profile.id !== profile.id), row]
    if (!state.defaultProfileId) state.defaultProfileId = profile.id
    await writeState(state)
  })
  ipcMain.handle('paltools-agent:remove-profile', async (_event, profileId) => { if (developmentProviderEnabled() && profileId === DEVELOPMENT_PROFILE_ID) throw new Error('开发者默认模型配置由本地文件托管，不能删除。'); const state = await readState(); state.profiles = state.profiles.filter((row) => row.profile.id !== profileId); if (state.defaultProfileId === profileId) state.defaultProfileId = state.profiles[0]?.profile.id ?? ''; sessionKeys.delete(profileId); await writeState(state) })
  ipcMain.handle('paltools-agent:set-default-profile', async (_event, profileId) => {
    if (developmentProviderEnabled() && profileId === DEVELOPMENT_PROFILE_ID) {
      const developmentState = await getDevelopmentProfileState()
      if (!developmentState.profile) throw new Error(developmentState.error || '开发者 API 配置不可用')
      sessionDefaultProfileId = profileId
      return
    }
    const state = await readState(); if (!state.profiles.some((row) => row.profile.id === profileId)) throw new Error('模型配置不存在'); sessionDefaultProfileId = ''; state.defaultProfileId = profileId; await writeState(state)
  })
  ipcMain.handle('paltools-agent:complete', async (event, profileId, request, requestId) => {
    const developmentState = await getDevelopmentProfileState(); const developmentProfile = developmentState.profile; const state = await readState(); const row = state.profiles.find((item) => item.profile.id === profileId)
    if (developmentProviderEnabled() && profileId === DEVELOPMENT_PROFILE_ID && !developmentProfile) throw new Error(developmentState.error || '开发者 API 配置不可用')
    const profile = developmentProfile?.id === profileId ? developmentProfile : row?.profile ?? null; if (!profile) throw new Error('模型配置不存在')
    let key = developmentProfile?.id === profileId ? sessionKeys.get(profileId) ?? '' : ''
    if (developmentProfile?.id !== profileId) {
      let decrypted
      try { decrypted = await decryptKey(row) }
      catch { throw new Error('API Key 解密或安全更新失败，请在设置中重新填写。') }
      key = decrypted.key
      if (decrypted.reEncryptedKey) {
        const currentRow = state.profiles.find((item) => item.profile.id === profileId)
        if (!currentRow) throw new Error('模型配置不存在')
        currentRow.encryptedKey = decrypted.reEncryptedKey
        try { await writeState(state) }
        catch { throw new Error('API Key 安全更新失败，请重试。') }
      }
    }
    if (profile.authMode !== 'none' && !key) throw new Error('API Key 不可用，请在设置中重新填写。')
    if (typeof requestId !== 'string' || !requestId) throw new Error('请求标识无效')
    if (!request || !Array.isArray(request.messages) || !Array.isArray(request.tools) || JSON.stringify(request).length > 1_000_000) throw new Error('模型请求无效或超过 1 MB 安全上限')
    const senderKey = `${event.sender.id}`; const requestKey = `${senderKey}:${requestId}`
    for (const [key, active] of activeRequests) if (key.startsWith(`${senderKey}:`)) active.abort('replaced')
    const controller = new AbortController(); activeRequests.set(requestKey, controller)
    const timeout = setTimeout(() => controller.abort('timeout'), profile.timeoutMs)
    const emit = (streamEvent) => { if (!event.sender.isDestroyed()) event.sender.send('paltools-agent:stream-event', requestId, streamEvent) }
    try { return await complete(profile, key, request, controller.signal, emit) } catch (error) { if (controller.signal.aborted) throw new Error(controller.signal.reason === 'timeout' ? '模型服务请求超时' : '已停止生成'); throw safeProviderFailure(error) } finally { clearTimeout(timeout); activeRequests.delete(requestKey) }
  })
  ipcMain.handle('paltools-agent:cancel', async (event, requestId) => { activeRequests.get(`${event.sender.id}:${requestId}`)?.abort('cancelled') })
}

module.exports = { registerAgentGateway }
