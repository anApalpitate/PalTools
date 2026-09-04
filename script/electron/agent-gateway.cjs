const { app, ipcMain, safeStorage } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

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

function endpoint(baseUrl, suffix) { return `${baseUrl.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}` }
function parseArguments(value) { if (value && typeof value === 'object' && !Array.isArray(value)) return value; if (typeof value !== 'string') return {}; try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {} } catch { return {} } }
function authHeaders(profile, key) { if (profile.authMode === 'bearer') return { Authorization: `Bearer ${key}` }; if (profile.authMode === 'x-api-key') return { [profile.transport === 'gemini-generate-content' ? 'x-goog-api-key' : 'x-api-key']: key }; if (profile.authMode === 'api-key') return { 'api-key': key }; return {} }
function openAiTools(tools) { return tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })) }

function buildRequest(profile, apiKey, request) {
  const headers = { 'Content-Type': 'application/json', ...authHeaders(profile, apiKey), ...profile.extraHeaders }
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
  const messages = request.messages.filter((message) => message.role !== 'system')
  const optional = { ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }), ...(profile.topP === undefined ? {} : { top_p: profile.topP }) }
  if (profile.transport === 'openai-chat') {
    const converted = messages.map((message) => message.role === 'tool' ? { role: 'tool', tool_call_id: message.toolCallId, content: message.content } : message.role === 'assistant' && message.toolCalls?.length ? { role: 'assistant', content: message.content || null, tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) } : { role: message.role, content: message.content })
    return { url: endpoint(profile.baseUrl, 'chat/completions'), headers, body: { ...profile.extraBody, model: profile.model, messages: [{ role: 'system', content: system }, ...converted], ...optional, ...(profile.maxOutputTokens ? { max_tokens: profile.maxOutputTokens } : {}), ...(request.allowTools ? { tools: openAiTools(request.tools) } : {}), stream: true, stream_options: { include_usage: true } } }
  }
  if (profile.transport === 'openai-responses') {
    const input = []
    for (const message of messages) {
      if (message.role === 'tool') input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content })
      else if (message.role === 'assistant' && message.toolCalls?.length) { if (message.content) input.push({ role: 'assistant', content: message.content }); for (const call of message.toolCalls) input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) }) }
      else input.push({ role: message.role, content: message.content })
    }
    return { url: endpoint(profile.baseUrl, 'responses'), headers, body: { ...profile.extraBody, model: profile.model, instructions: system, input, store: false, ...optional, ...(profile.maxOutputTokens ? { max_output_tokens: profile.maxOutputTokens } : {}), ...(request.allowTools ? { tools: request.tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.inputSchema, strict: true })) } : {}), stream: true } }
  }
  if (profile.transport === 'anthropic-messages') {
    headers['anthropic-version'] = '2023-06-01'
    const converted = []
    for (const message of messages) {
      if (message.role === 'tool') converted.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }] })
      else if (message.role === 'assistant' && message.toolCalls?.length) converted.push({ role: 'assistant', content: [...(message.content ? [{ type: 'text', text: message.content }] : []), ...message.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments }))] })
      else converted.push({ role: message.role, content: message.content })
    }
    return { url: endpoint(profile.baseUrl, 'v1/messages'), headers, body: { ...profile.extraBody, model: profile.model, system, messages: converted, max_tokens: profile.maxOutputTokens ?? 2048, ...optional, ...(request.allowTools ? { tools: request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema })) } : {}), stream: true } }
  }
  const contents = []
  for (const message of messages) {
    if (message.role === 'tool') contents.push({ role: 'user', parts: [{ functionResponse: { name: message.name, response: { result: message.content } } }] })
    else if (message.role === 'assistant' && message.toolCalls?.length) contents.push({ role: 'model', parts: [...(message.content ? [{ text: message.content }] : []), ...message.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.arguments } }))] })
    else contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })
  }
  return { url: endpoint(profile.baseUrl, `v1beta/models/${encodeURIComponent(profile.model)}:streamGenerateContent?alt=sse`), headers, body: { ...profile.extraBody, system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }), ...(profile.topP === undefined ? {} : { topP: profile.topP }), ...(profile.maxOutputTokens ? { maxOutputTokens: profile.maxOutputTokens } : {}) }, ...(request.allowTools ? { tools: [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) }] } : {}) } }
}

function parseResponse(profile, data) {
  if (data?.error) throw new Error(String(data.error.message ?? data.error.status ?? '模型服务返回错误'))
  if (profile.transport === 'openai-chat') { const message = data?.choices?.[0]?.message ?? {}; return { text: typeof message.content === 'string' ? message.content : '', toolCalls: (message.tool_calls ?? []).map((call, index) => ({ id: String(call.id ?? `call-${index}`), name: String(call.function?.name ?? ''), arguments: parseArguments(call.function?.arguments) })).filter((call) => call.name), usage: { inputTokens: data?.usage?.prompt_tokens, outputTokens: data?.usage?.completion_tokens, totalTokens: data?.usage?.total_tokens } } }
  if (profile.transport === 'openai-responses') { const output = Array.isArray(data?.output) ? data.output : []; const text = typeof data?.output_text === 'string' ? data.output_text : output.flatMap((item) => item.type === 'message' ? (item.content ?? []).filter((part) => part.type === 'output_text').map((part) => part.text) : []).join(''); return { text, toolCalls: output.filter((item) => item.type === 'function_call').map((call, index) => ({ id: String(call.call_id ?? call.id ?? `call-${index}`), name: String(call.name ?? ''), arguments: parseArguments(call.arguments) })), usage: { inputTokens: data?.usage?.input_tokens, outputTokens: data?.usage?.output_tokens, totalTokens: data?.usage?.total_tokens } } }
  if (profile.transport === 'anthropic-messages') { const content = Array.isArray(data?.content) ? data.content : []; return { text: content.filter((block) => block.type === 'text').map((block) => block.text).join(''), toolCalls: content.filter((block) => block.type === 'tool_use').map((block, index) => ({ id: String(block.id ?? `call-${index}`), name: String(block.name ?? ''), arguments: parseArguments(block.input) })), usage: { inputTokens: data?.usage?.input_tokens, outputTokens: data?.usage?.output_tokens } } }
  const parts = data?.candidates?.[0]?.content?.parts ?? []; return { text: parts.filter((part) => typeof part.text === 'string').map((part) => part.text).join(''), toolCalls: parts.filter((part) => part.functionCall).map((part, index) => ({ id: `gemini-call-${index}`, name: String(part.functionCall.name ?? ''), arguments: parseArguments(part.functionCall.args) })), usage: { inputTokens: data?.usageMetadata?.promptTokenCount, outputTokens: data?.usageMetadata?.candidatesTokenCount, totalTokens: data?.usageMetadata?.totalTokenCount } }
}

function providerHttpError(status, detail) {
  const suffix = detail ? `：${detail}` : `（HTTP ${status}）`
  if (status === 401 || status === 403) return `模型服务认证失败，请检查 API Key、权限和模型${suffix}`
  if (status === 429) return `模型服务请求过于频繁或额度不足${suffix}`
  if (status >= 500) return `模型服务暂时不可用${suffix}`
  return `模型服务请求失败${suffix}`
}

function createStreamAccumulator(profile) {
  let text = ''; let usage; const calls = new Map()
  const callAt = (index) => { const current = calls.get(index) ?? { id: `call-${index}`, name: '', argumentsText: '' }; calls.set(index, current); return current }
  const append = (delta, emit) => { if (typeof delta === 'string' && delta) { text += delta; emit({ type: 'text-delta', text: delta }) } }
  return {
    push(data, emit) {
      if (data?.error) throw new Error(String(data.error.message ?? data.error.status ?? '模型服务返回错误'))
      if (profile.transport === 'openai-chat') {
        if (data?.usage) usage = { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens }
        const delta = data?.choices?.[0]?.delta ?? {}; for (const fragment of delta.tool_calls ?? []) { const call = callAt(Number(fragment.index ?? 0)); if (fragment.id) call.id = String(fragment.id); if (fragment.function?.name) call.name += String(fragment.function.name); if (fragment.function?.arguments) call.argumentsText += String(fragment.function.arguments) } append(delta.content, emit); return
      }
      if (profile.transport === 'openai-responses') {
        if (data.type === 'response.output_text.delta') append(data.delta, emit)
        if (data.type === 'response.output_item.added' && data.item?.type === 'function_call') { const call = callAt(Number(data.output_index ?? calls.size)); call.id = String(data.item.call_id ?? data.item.id ?? call.id); call.name = String(data.item.name ?? ''); call.argumentsText = String(data.item.arguments ?? '') }
        if (data.type === 'response.function_call_arguments.delta') { const call = callAt(Number(data.output_index ?? 0)); if (data.call_id) call.id = String(data.call_id); call.argumentsText += String(data.delta ?? '') }
        if (data.type === 'response.function_call_arguments.done') { const call = callAt(Number(data.output_index ?? 0)); if (data.call_id) call.id = String(data.call_id); if (data.name) call.name = String(data.name); if (typeof data.arguments === 'string') call.argumentsText = data.arguments }
        if (data.type === 'response.completed' && data.response?.usage) usage = { inputTokens: data.response.usage.input_tokens, outputTokens: data.response.usage.output_tokens, totalTokens: data.response.usage.total_tokens }; return
      }
      if (profile.transport === 'anthropic-messages') {
        if (data.type === 'message_start' && data.message?.usage) usage = { inputTokens: data.message.usage.input_tokens, outputTokens: data.message.usage.output_tokens }
        if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') { const call = callAt(Number(data.index ?? calls.size)); call.id = String(data.content_block.id ?? call.id); call.name = String(data.content_block.name ?? ''); call.argumentsValue = parseArguments(data.content_block.input) }
        if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') callAt(Number(data.index ?? 0)).argumentsText += String(data.delta.partial_json ?? '')
        if (data.type === 'message_delta' && data.usage) usage = { ...usage, outputTokens: data.usage.output_tokens }
        if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') append(data.delta.text, emit); return
      }
      if (data?.usageMetadata) usage = { inputTokens: data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata.candidatesTokenCount, totalTokens: data.usageMetadata.totalTokenCount }
      for (const [index, part] of (data?.candidates?.[0]?.content?.parts ?? []).entries()) { append(part.text, emit); if (part.functionCall) { const call = callAt(index); call.id = `gemini-call-${index}`; call.name = String(part.functionCall.name ?? ''); call.argumentsValue = parseArguments(part.functionCall.args) } }
    },
    result() { return { text, toolCalls: [...calls.values()].filter((call) => call.name).map((call) => ({ id: call.id, name: call.name, arguments: call.argumentsText ? parseArguments(call.argumentsText) : (call.argumentsValue ?? {}) })), usage } },
  }
}

async function consumeSse(stream, onPayload) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = ''; let totalBytes = 0
  const consumeBlock = (block) => { const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n'); if (!data || data === '[DONE]') return; try { onPayload(JSON.parse(data)) } catch (error) { if (error instanceof SyntaxError) throw new Error('模型服务返回了畸形流式事件'); throw error } }
  try { while (true) { const { done, value } = await reader.read(); if (done) break; totalBytes += value.byteLength; if (totalBytes > 2_000_000) throw new Error('模型响应超过 2 MB 安全上限'); buffer += decoder.decode(value, { stream: true }); const blocks = buffer.split(/\r?\n\r?\n/); buffer = blocks.pop() ?? ''; for (const block of blocks) consumeBlock(block) } buffer += decoder.decode(); if (buffer.trim()) consumeBlock(buffer) } finally { reader.releaseLock() }
}

async function complete(profile, key, request, signal, emit) {
  const outgoing = buildRequest(profile, key, request)
  const requestBody = JSON.stringify(outgoing.body)
  if (requestBody.length > 1_000_000) throw new Error('模型请求超过 1 MB 安全上限')
  const response = await fetch(outgoing.url, { method: 'POST', headers: outgoing.headers, body: requestBody, signal, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) throw new Error('模型服务返回了未允许的重定向')
  if (response.ok && response.headers.get('content-type')?.includes('text/event-stream') && response.body) { const accumulator = createStreamAccumulator(profile); await consumeSse(response.body, (payload) => accumulator.push(payload, emit)); return accumulator.result() }
  const text = await response.text()
  if (text.length > 2_000_000) throw new Error('模型响应超过 2 MB 安全上限')
  let payload
  try { payload = JSON.parse(text) } catch { throw new Error(`模型服务返回了无法解析的内容（HTTP ${response.status}）`) }
  if (!response.ok) throw new Error(providerHttpError(response.status, payload?.error?.message))
  return parseResponse(profile, payload)
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
