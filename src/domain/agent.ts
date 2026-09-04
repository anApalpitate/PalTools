import { z } from 'zod'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ProviderTransport =
  | 'openai-responses'
  | 'openai-chat'
  | 'anthropic-messages'
  | 'gemini-generate-content'

export type ProviderAuthMode = 'bearer' | 'x-api-key' | 'api-key' | 'none'
export type ProviderCapabilityMode = 'auto' | 'tools' | 'retrieval-only'

export interface ProviderProfileV1 {
  schemaVersion: 1
  id: string
  presetId: string
  displayName: string
  transport: ProviderTransport
  baseUrl: string
  model: string
  authMode: ProviderAuthMode
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  timeoutMs: number
  contextTurns: number
  capabilityMode: ProviderCapabilityMode
  extraHeaders: Record<string, string>
  extraBody: Record<string, JsonValue>
  hasApiKey?: boolean
}

export interface ProviderPreset {
  id: string
  label: string
  transport: ProviderTransport
  baseUrl: string
  authMode: ProviderAuthMode
  modelPlaceholder: string
  docsUrl: string
  note: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', transport: 'openai-responses', baseUrl: 'https://api.openai.com/v1', authMode: 'bearer', modelPlaceholder: '填写 Responses API 模型 ID', docsUrl: 'https://developers.openai.com/api/reference/cli/resources/responses/methods/create', note: '使用 Responses API 与函数工具。' },
  { id: 'azure-openai', label: 'Azure OpenAI', transport: 'openai-responses', baseUrl: 'https://YOUR-RESOURCE.openai.azure.com/openai/v1', authMode: 'api-key', modelPlaceholder: '填写部署名称', docsUrl: 'https://learn.microsoft.com/azure/ai-foundry/openai/how-to/responses', note: '将 YOUR-RESOURCE 替换为资源名，模型填写部署名称。' },
  { id: 'anthropic', label: 'Anthropic', transport: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', authMode: 'x-api-key', modelPlaceholder: '填写 Claude 模型 ID', docsUrl: 'https://platform.claude.com/docs/en/api/messages/create', note: '使用原生 Messages API。' },
  { id: 'gemini', label: 'Google Gemini', transport: 'gemini-generate-content', baseUrl: 'https://generativelanguage.googleapis.com', authMode: 'x-api-key', modelPlaceholder: '填写 Gemini 模型 ID', docsUrl: 'https://ai.google.dev/api', note: '使用原生 generateContent 接口。' },
  { id: 'deepseek', label: 'DeepSeek', transport: 'openai-chat', baseUrl: 'https://api.deepseek.com', authMode: 'bearer', modelPlaceholder: '填写支持工具调用的模型 ID', docsUrl: 'https://api-docs.deepseek.com/', note: 'OpenAI 兼容接口。' },
  { id: 'qwen-cn', label: '通义千问（中国内地）', transport: 'openai-chat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', authMode: 'bearer', modelPlaceholder: '填写 DashScope 模型 ID', docsUrl: 'https://help.aliyun.com/zh/model-studio/get-api-key/', note: '如使用海外地域，请按官方文档替换 Base URL。' },
  { id: 'qwen-sg', label: '通义千问（新加坡）', transport: 'openai-chat', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', authMode: 'bearer', modelPlaceholder: '填写新加坡地域模型 ID', docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key', note: '国际站新加坡地域，API Key 与中国内地不通用。' },
  { id: 'qwen-us', label: '通义千问（美国）', transport: 'openai-chat', baseUrl: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1', authMode: 'bearer', modelPlaceholder: '填写美国地域模型 ID', docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key', note: '国际站美国地域，API Key 与其他地域不通用。' },
  { id: 'kimi', label: 'Kimi / Moonshot', transport: 'openai-chat', baseUrl: 'https://api.moonshot.cn/v1', authMode: 'bearer', modelPlaceholder: '填写 Kimi 模型 ID', docsUrl: 'https://platform.kimi.com/docs/api/chat', note: 'OpenAI 兼容 Chat Completions。' },
  { id: 'zhipu', label: '智谱 GLM', transport: 'openai-chat', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', authMode: 'bearer', modelPlaceholder: '填写 GLM 模型 ID', docsUrl: 'https://docs.bigmodel.cn/cn/guide/develop/http/introduction', note: 'OpenAI 兼容接口。' },
  { id: 'siliconflow', label: '硅基流动', transport: 'openai-chat', baseUrl: 'https://api.siliconflow.cn/v1', authMode: 'bearer', modelPlaceholder: '填写模型 ID', docsUrl: 'https://api-docs.siliconflow.cn/docs/userguide/introduction', note: 'OpenAI 兼容接口。' },
  { id: 'xai', label: 'xAI', transport: 'openai-chat', baseUrl: 'https://api.x.ai/v1', authMode: 'bearer', modelPlaceholder: '填写 Grok 模型 ID', docsUrl: 'https://docs.x.ai/developers/rest-api-reference/inference/chat', note: 'OpenAI 兼容 Chat Completions。' },
  { id: 'mistral', label: 'Mistral AI', transport: 'openai-chat', baseUrl: 'https://api.mistral.ai/v1', authMode: 'bearer', modelPlaceholder: '填写 Mistral 模型 ID', docsUrl: 'https://docs.mistral.ai/api', note: 'OpenAI 风格 Chat Completions。' },
  { id: 'openrouter', label: 'OpenRouter', transport: 'openai-chat', baseUrl: 'https://openrouter.ai/api/v1', authMode: 'bearer', modelPlaceholder: '填写 provider/model', docsUrl: 'https://openrouter.ai/docs/quickstart', note: '模型需支持 tools 参数。' },
  { id: 'ollama', label: 'Ollama（本机）', transport: 'openai-chat', baseUrl: 'http://127.0.0.1:11434/v1', authMode: 'none', modelPlaceholder: '填写本机模型名称', docsUrl: 'https://docs.ollama.com/api/openai-compatibility', note: '无需 API Key，仅允许本机 HTTP。' },
  { id: 'custom', label: '自定义兼容接口', transport: 'openai-chat', baseUrl: 'https://', authMode: 'bearer', modelPlaceholder: '填写模型 ID', docsUrl: '', note: '按服务商说明选择协议、认证方式和地址。' },
]

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(),
  z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]))

export const providerProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(100),
  presetId: z.string().min(1).max(100),
  displayName: z.string().trim().min(1).max(80),
  transport: z.enum(['openai-responses', 'openai-chat', 'anthropic-messages', 'gemini-generate-content']),
  baseUrl: z.string().trim().min(1).max(500),
  model: z.string().trim().min(1).max(200),
  authMode: z.enum(['bearer', 'x-api-key', 'api-key', 'none']),
  temperature: z.number().finite().min(0).max(2).optional(),
  topP: z.number().finite().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).max(128000).optional(),
  timeoutMs: z.number().int().min(5000).max(180000),
  contextTurns: z.number().int().min(1).max(30),
  capabilityMode: z.enum(['auto', 'tools', 'retrieval-only']),
  extraHeaders: z.record(z.string(), z.string()),
  extraBody: z.record(z.string(), jsonValueSchema),
  hasApiKey: z.boolean().optional(),
})

export const RESERVED_HEADERS = new Set([
  'authorization', 'proxy-authorization', 'host', 'cookie', 'content-length',
  'origin', 'referer', 'x-api-key', 'x-goog-api-key', 'api-key', 'anthropic-version', 'content-type',
])

export const RESERVED_BODY_KEYS = new Set([
  'model', 'messages', 'input', 'contents', 'tools', 'tool_choice', 'stream',
  'system', 'system_instruction', 'max_tokens', 'max_output_tokens',
  'max_completion_tokens', 'temperature', 'top_p',
])

export function validateProviderProfile(profile: ProviderProfileV1): ProviderProfileV1 {
  const parsed = providerProfileSchema.parse(profile)
  if (JSON.stringify({ headers: parsed.extraHeaders, body: parsed.extraBody }).length > 100_000) throw new Error('高级请求参数超过 100 KB 安全上限')
  validateProviderUrl(parsed.baseUrl)
  for (const key of Object.keys(parsed.extraHeaders)) {
    if (RESERVED_HEADERS.has(key.toLocaleLowerCase('en-US'))) {
      throw new Error(`额外请求头不能覆盖 ${key}`)
    }
  }
  for (const key of Object.keys(parsed.extraBody)) {
    if (RESERVED_BODY_KEYS.has(key)) throw new Error(`额外参数不能覆盖 ${key}`)
  }
  return parsed
}

export function validateProviderUrl(rawUrl: string): URL {
  let url: URL
  try { url = new URL(rawUrl) } catch { throw new Error('API 地址不是有效 URL') }
  if (url.username || url.password) throw new Error('API 地址不能包含用户名或密码')
  const loopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error('API 地址必须使用 HTTPS；只有本机回环地址可以使用 HTTP')
  }
  return url
}

export function createProviderProfile(presetId: string): ProviderProfileV1 {
  const preset = PROVIDER_PRESETS.find((candidate) => candidate.id === presetId) ?? PROVIDER_PRESETS[0]
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    presetId: preset.id,
    displayName: preset.label,
    transport: preset.transport,
    baseUrl: preset.baseUrl,
    model: '',
    authMode: preset.authMode,
    timeoutMs: 60000,
    contextTurns: 12,
    capabilityMode: 'auto',
    extraHeaders: {},
    extraBody: {},
  }
}
