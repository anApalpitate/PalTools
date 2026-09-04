import type { AgentToolDefinition } from './knowledge'
import type { JsonValue, ProviderProfileV1 } from './agent'
import { validateProviderProfile } from './agent'

export interface AgentToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type AgentModelMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: AgentToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; name: string }

export interface AgentModelRequest {
  messages: AgentModelMessage[]
  tools: AgentToolDefinition[]
  allowTools: boolean
}

export interface AgentModelResult {
  text: string
  toolCalls: AgentToolCall[]
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

export interface AgentStreamEvent {
  type: 'text-delta' | 'status'
  text: string
}

export interface ProviderHttpRequest {
  url: string
  headers: Record<string, string>
  body: Record<string, JsonValue>
}

function endpoint(baseUrl: string, suffix: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

function authHeaders(profile: ProviderProfileV1, apiKey: string): Record<string, string> {
  if (profile.authMode === 'bearer') return { Authorization: `Bearer ${apiKey}` }
  if (profile.authMode === 'x-api-key') return { [profile.transport === 'gemini-generate-content' ? 'x-goog-api-key' : 'x-api-key']: apiKey }
  if (profile.authMode === 'api-key') return { 'api-key': apiKey }
  return {}
}

function optionalParameters(profile: ProviderProfileV1): Record<string, JsonValue> {
  return {
    ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }),
    ...(profile.topP === undefined ? {} : { top_p: profile.topP }),
  }
}

function openAiTools(tools: AgentToolDefinition[]): JsonValue[] {
  return tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema as JsonValue } }))
}

export function buildProviderRequest(profileInput: ProviderProfileV1, apiKey: string, request: AgentModelRequest): ProviderHttpRequest {
  const profile = validateProviderProfile(profileInput)
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...authHeaders(profile, apiKey), ...profile.extraHeaders }
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
  const nonSystem = request.messages.filter((message) => message.role !== 'system')

  if (profile.transport === 'openai-chat') {
    const messages = nonSystem.map((message) => {
      if (message.role === 'tool') return { role: 'tool', tool_call_id: message.toolCallId, content: message.content }
      if (message.role === 'assistant' && message.toolCalls?.length) return { role: 'assistant', content: message.content || null, tool_calls: message.toolCalls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) }
      return { role: message.role, content: message.content }
    })
    return { url: endpoint(profile.baseUrl, 'chat/completions'), headers, body: { ...profile.extraBody, model: profile.model, messages: [{ role: 'system', content: system }, ...messages] as JsonValue, ...optionalParameters(profile), ...(profile.maxOutputTokens ? { max_tokens: profile.maxOutputTokens } : {}), ...(request.allowTools ? { tools: openAiTools(request.tools) } : {}) } }
  }

  if (profile.transport === 'openai-responses') {
    const input: JsonValue[] = []
    for (const message of nonSystem) {
      if (message.role === 'tool') input.push({ type: 'function_call_output', call_id: message.toolCallId, output: message.content })
      else {
        if (message.role === 'assistant' && message.toolCalls?.length) {
          if (message.content) input.push({ role: 'assistant', content: message.content })
          for (const call of message.toolCalls) input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) })
        } else input.push({ role: message.role, content: message.content })
      }
    }
    const tools = request.tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.inputSchema as JsonValue, strict: true }))
    return { url: endpoint(profile.baseUrl, 'responses'), headers, body: { ...profile.extraBody, model: profile.model, instructions: system, input, store: false, ...optionalParameters(profile), ...(profile.maxOutputTokens ? { max_output_tokens: profile.maxOutputTokens } : {}), ...(request.allowTools ? { tools } : {}) } }
  }

  if (profile.transport === 'anthropic-messages') {
    headers['anthropic-version'] = '2023-06-01'
    const messages: JsonValue[] = []
    for (const message of nonSystem) {
      if (message.role === 'tool') messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: message.toolCallId, content: message.content }] })
      else if (message.role === 'assistant' && message.toolCalls?.length) messages.push({ role: 'assistant', content: [ ...(message.content ? [{ type: 'text', text: message.content }] : []), ...message.toolCalls.map((call) => ({ type: 'tool_use', id: call.id, name: call.name, input: call.arguments as JsonValue })) ] })
      else messages.push({ role: message.role, content: message.content })
    }
    const tools = request.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema as JsonValue }))
    return { url: endpoint(profile.baseUrl, 'v1/messages'), headers, body: { ...profile.extraBody, model: profile.model, system, messages, max_tokens: profile.maxOutputTokens ?? 2048, ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }), ...(profile.topP === undefined ? {} : { top_p: profile.topP }), ...(request.allowTools ? { tools } : {}) } }
  }

  const contents: JsonValue[] = []
  for (const message of nonSystem) {
    if (message.role === 'tool') contents.push({ role: 'user', parts: [{ functionResponse: { name: message.name, response: { result: message.content } } }] })
    else if (message.role === 'assistant' && message.toolCalls?.length) contents.push({ role: 'model', parts: [ ...(message.content ? [{ text: message.content }] : []), ...message.toolCalls.map((call) => ({ functionCall: { name: call.name, args: call.arguments as JsonValue } })) ] })
    else contents.push({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })
  }
  const generationConfig = { ...(profile.temperature === undefined ? {} : { temperature: profile.temperature }), ...(profile.topP === undefined ? {} : { topP: profile.topP }), ...(profile.maxOutputTokens ? { maxOutputTokens: profile.maxOutputTokens } : {}) }
  const tools = [{ functionDeclarations: request.tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema as JsonValue })) }]
  return { url: endpoint(profile.baseUrl, `v1beta/models/${encodeURIComponent(profile.model)}:generateContent`), headers, body: { ...profile.extraBody, system_instruction: { parts: [{ text: system }] }, contents, generationConfig, ...(request.allowTools ? { tools } : {}) } }
}

export function buildProviderStreamRequest(profile: ProviderProfileV1, apiKey: string, request: AgentModelRequest): ProviderHttpRequest {
  const outgoing = buildProviderRequest(profile, apiKey, request)
  if (profile.transport === 'gemini-generate-content') {
    return {
      ...outgoing,
      url: outgoing.url.replace(':generateContent', ':streamGenerateContent?alt=sse'),
    }
  }
  return {
    ...outgoing,
    body: {
      ...outgoing.body,
      stream: true,
      ...(profile.transport === 'openai-chat' ? { stream_options: { include_usage: true } } : {}),
    },
  }
}

export interface ProviderStreamAccumulator {
  push(payload: unknown): AgentStreamEvent[]
  result(): AgentModelResult
}

interface PendingToolCall {
  id: string
  name: string
  argumentsText: string
  argumentsValue?: Record<string, unknown>
}

function usageFromOpenAi(data: Record<string, any>): AgentModelResult['usage'] {
  return {
    inputTokens: data?.input_tokens ?? data?.prompt_tokens,
    outputTokens: data?.output_tokens ?? data?.completion_tokens,
    totalTokens: data?.total_tokens,
  }
}

export function createProviderStreamAccumulator(profile: ProviderProfileV1): ProviderStreamAccumulator {
  let text = ''
  let usage: AgentModelResult['usage']
  const calls = new Map<number, PendingToolCall>()
  const append = (delta: unknown): AgentStreamEvent[] => {
    if (typeof delta !== 'string' || !delta) return []
    text += delta
    return [{ type: 'text-delta', text: delta }]
  }
  const callAt = (index: number): PendingToolCall => {
    const current = calls.get(index) ?? { id: `call-${index}`, name: '', argumentsText: '' }
    calls.set(index, current)
    return current
  }

  return {
    push(payload: unknown): AgentStreamEvent[] {
      const data = payload as Record<string, any>
      if (data?.error) throw new Error(String(data.error.message ?? data.error.status ?? '模型服务返回错误'))

      if (profile.transport === 'openai-chat') {
        if (data?.usage) usage = usageFromOpenAi(data.usage)
        const delta = data?.choices?.[0]?.delta ?? {}
        for (const fragment of delta.tool_calls ?? []) {
          const call = callAt(Number(fragment.index ?? 0))
          if (fragment.id) call.id = String(fragment.id)
          if (fragment.function?.name) call.name += String(fragment.function.name)
          if (fragment.function?.arguments) call.argumentsText += String(fragment.function.arguments)
        }
        return append(delta.content)
      }

      if (profile.transport === 'openai-responses') {
        if (data.type === 'response.output_text.delta') return append(data.delta)
        if (data.type === 'response.output_item.added' && data.item?.type === 'function_call') {
          const call = callAt(Number(data.output_index ?? calls.size))
          call.id = String(data.item.call_id ?? data.item.id ?? call.id)
          call.name = String(data.item.name ?? '')
          call.argumentsText = String(data.item.arguments ?? '')
        }
        if (data.type === 'response.function_call_arguments.delta') {
          const call = callAt(Number(data.output_index ?? 0))
          if (data.call_id) call.id = String(data.call_id)
          call.argumentsText += String(data.delta ?? '')
        }
        if (data.type === 'response.function_call_arguments.done') {
          const call = callAt(Number(data.output_index ?? 0))
          if (data.call_id) call.id = String(data.call_id)
          if (data.name) call.name = String(data.name)
          if (typeof data.arguments === 'string') call.argumentsText = data.arguments
        }
        if (data.type === 'response.completed' && data.response?.usage) usage = usageFromOpenAi(data.response.usage)
        return []
      }

      if (profile.transport === 'anthropic-messages') {
        if (data.type === 'message_start' && data.message?.usage) usage = { inputTokens: data.message.usage.input_tokens, outputTokens: data.message.usage.output_tokens }
        if (data.type === 'content_block_start' && data.content_block?.type === 'tool_use') {
          const call = callAt(Number(data.index ?? calls.size))
          call.id = String(data.content_block.id ?? call.id)
          call.name = String(data.content_block.name ?? '')
          call.argumentsValue = parseArguments(data.content_block.input)
        }
        if (data.type === 'content_block_delta' && data.delta?.type === 'input_json_delta') callAt(Number(data.index ?? 0)).argumentsText += String(data.delta.partial_json ?? '')
        if (data.type === 'message_delta' && data.usage) usage = { ...usage, outputTokens: data.usage.output_tokens }
        return data.type === 'content_block_delta' && data.delta?.type === 'text_delta' ? append(data.delta.text) : []
      }

      if (data?.usageMetadata) usage = { inputTokens: data.usageMetadata.promptTokenCount, outputTokens: data.usageMetadata.candidatesTokenCount, totalTokens: data.usageMetadata.totalTokenCount }
      const parts = data?.candidates?.[0]?.content?.parts ?? []
      const events: AgentStreamEvent[] = []
      for (const [index, part] of parts.entries()) {
        events.push(...append(part.text))
        if (part.functionCall) {
          const call = callAt(index)
          call.id = `gemini-call-${index}`
          call.name = String(part.functionCall.name ?? '')
          call.argumentsValue = parseArguments(part.functionCall.args)
        }
      }
      return events
    },
    result() {
      return {
        text,
        toolCalls: [...calls.values()].filter((call) => call.name).map((call) => ({ id: call.id, name: call.name, arguments: call.argumentsText ? parseArguments(call.argumentsText) : (call.argumentsValue ?? {}) })),
        usage,
      }
    },
  }
}

export function parseProviderResponse(profile: ProviderProfileV1, payload: unknown): AgentModelResult {
  const data = payload as Record<string, any>
  if (data?.error) throw new Error(String(data.error.message ?? data.error.status ?? '模型服务返回错误'))

  if (profile.transport === 'openai-chat') {
    const message = data?.choices?.[0]?.message ?? {}
    return { text: typeof message.content === 'string' ? message.content : '', toolCalls: (message.tool_calls ?? []).map((call: any, index: number) => ({ id: String(call.id ?? `call-${index}`), name: String(call.function?.name ?? ''), arguments: parseArguments(call.function?.arguments) })).filter((call: AgentToolCall) => call.name), usage: { inputTokens: data?.usage?.prompt_tokens, outputTokens: data?.usage?.completion_tokens, totalTokens: data?.usage?.total_tokens } }
  }
  if (profile.transport === 'openai-responses') {
    const output = Array.isArray(data?.output) ? data.output : []
    const text = typeof data?.output_text === 'string' ? data.output_text : output.flatMap((item: any) => item.type === 'message' ? (item.content ?? []).filter((part: any) => part.type === 'output_text').map((part: any) => part.text) : []).join('')
    return { text, toolCalls: output.filter((item: any) => item.type === 'function_call').map((call: any, index: number) => ({ id: String(call.call_id ?? call.id ?? `call-${index}`), name: String(call.name ?? ''), arguments: parseArguments(call.arguments) })), usage: { inputTokens: data?.usage?.input_tokens, outputTokens: data?.usage?.output_tokens, totalTokens: data?.usage?.total_tokens } }
  }
  if (profile.transport === 'anthropic-messages') {
    const content = Array.isArray(data?.content) ? data.content : []
    return { text: content.filter((block: any) => block.type === 'text').map((block: any) => block.text).join(''), toolCalls: content.filter((block: any) => block.type === 'tool_use').map((block: any, index: number) => ({ id: String(block.id ?? `call-${index}`), name: String(block.name ?? ''), arguments: parseArguments(block.input) })), usage: { inputTokens: data?.usage?.input_tokens, outputTokens: data?.usage?.output_tokens } }
  }
  const parts = data?.candidates?.[0]?.content?.parts ?? []
  return { text: parts.filter((part: any) => typeof part.text === 'string').map((part: any) => part.text).join(''), toolCalls: parts.filter((part: any) => part.functionCall).map((part: any, index: number) => ({ id: `gemini-call-${index}`, name: String(part.functionCall.name ?? ''), arguments: parseArguments(part.functionCall.args) })), usage: { inputTokens: data?.usageMetadata?.promptTokenCount, outputTokens: data?.usageMetadata?.candidatesTokenCount, totalTokens: data?.usageMetadata?.totalTokenCount } }
}
