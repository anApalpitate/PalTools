import { z } from 'zod'
import { catalogModelsForProvider, type ProviderModelCapability, type ProviderModelStatus } from './provider-catalog'

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

export interface ProviderModelConfigV2 {
  modelId: string
  enabled: boolean
  label?: string
  status?: ProviderModelStatus
  capabilities?: ProviderModelCapability[]
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  contextTurns: number
  capabilityMode: ProviderCapabilityMode
  extraBody: Record<string, JsonValue>
}

export interface ProviderProfileV2 {
  schemaVersion: 2
  id: string
  presetId: string
  displayName: string
  transport: ProviderTransport
  baseUrl: string
  defaultModelId: string
  models: ProviderModelConfigV2[]
  authMode: ProviderAuthMode
  timeoutMs: number
  extraHeaders: Record<string, string>
  hasApiKey?: boolean
}

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

export type ProviderProfile = ProviderProfileV2

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
  { id: 'openai', label: 'OpenAI', transport: 'openai-responses', baseUrl: 'https://api.openai.com/v1', authMode: 'bearer', modelPlaceholder: '例如 gpt-5.6-luna…', docsUrl: 'https://developers.openai.com/api/reference/cli/resources/responses/methods/create', note: '使用 Responses API 与函数工具。' },
  { id: 'anthropic', label: 'Anthropic', transport: 'anthropic-messages', baseUrl: 'https://api.anthropic.com', authMode: 'x-api-key', modelPlaceholder: '例如 claude-sonnet-5…', docsUrl: 'https://platform.claude.com/docs/en/api/messages/create', note: '使用原生 Messages API。' },
  { id: 'gemini', label: 'Google Gemini', transport: 'gemini-generate-content', baseUrl: 'https://generativelanguage.googleapis.com', authMode: 'x-api-key', modelPlaceholder: '例如 gemini-3.8-flash…', docsUrl: 'https://ai.google.dev/api', note: '使用原生 generateContent 接口。' },
  { id: 'deepseek', label: 'DeepSeek', transport: 'openai-chat', baseUrl: 'https://api.deepseek.com', authMode: 'bearer', modelPlaceholder: '例如 deepseek-v4-pro…', docsUrl: 'https://api-docs.deepseek.com/', note: 'OpenAI 兼容接口。' },
  { id: 'glm', label: '智谱 GLM（中国内地）', transport: 'openai-chat', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', authMode: 'bearer', modelPlaceholder: '例如 glm-5.3…', docsUrl: 'https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3', note: '使用智谱开放平台中国内地 Chat Completions 接口。' },
  { id: 'qwen-cn', label: '通义千问（中国内地）', transport: 'openai-chat', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', authMode: 'bearer', modelPlaceholder: '例如 qwen3.8-max…', docsUrl: 'https://help.aliyun.com/zh/model-studio/get-api-key/', note: '使用阿里云百炼中国内地兼容接口。' },
  { id: 'kimi', label: 'Kimi / Moonshot', transport: 'openai-chat', baseUrl: 'https://api.moonshot.cn/v1', authMode: 'bearer', modelPlaceholder: '例如 kimi-k3…', docsUrl: 'https://platform.kimi.com/docs/api/chat', note: 'OpenAI 兼容 Chat Completions。' },
  { id: 'openrouter', label: 'OpenRouter', transport: 'openai-chat', baseUrl: 'https://openrouter.ai/api/v1', authMode: 'bearer', modelPlaceholder: '例如 provider/model…', docsUrl: 'https://openrouter.ai/docs/quickstart', note: '模型需支持 tools 参数。' },
  { id: 'ollama', label: 'Ollama（本机）', transport: 'openai-chat', baseUrl: 'http://127.0.0.1:11434/v1', authMode: 'none', modelPlaceholder: '例如 qwen3.5:9b…', docsUrl: 'https://docs.ollama.com/api/openai-compatibility', note: '无需 API Key，仅允许本机 HTTP；请先在 Ollama 中安装所选模型，保存配置不会自动下载。' },
  { id: 'custom', label: '自定义兼容接口', transport: 'openai-chat', baseUrl: 'https://', authMode: 'bearer', modelPlaceholder: '例如 vendor/model…', docsUrl: '', note: '按服务商说明选择协议、认证方式和地址。' },
]

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(),
  z.array(jsonValueSchema), z.record(z.string(), jsonValueSchema),
]))

const providerModelConfigSchema = z.object({
  modelId: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
  label: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['stable', 'preview', 'experimental']).optional(),
  capabilities: z.array(z.enum(['text', 'tools', 'vision'])).max(3).optional(),
  temperature: z.number().finite().min(0).max(2).optional(),
  topP: z.number().finite().min(0).max(1).optional(),
  maxOutputTokens: z.number().int().min(1).max(128000).optional(),
  contextTurns: z.number().int().min(1).max(30),
  capabilityMode: z.enum(['auto', 'tools', 'retrieval-only']),
  extraBody: z.record(z.string(), jsonValueSchema),
})

const providerProfileV2Schema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1).max(100),
  presetId: z.string().min(1).max(100),
  displayName: z.string().trim().min(1).max(80),
  transport: z.enum(['openai-responses', 'openai-chat', 'anthropic-messages', 'gemini-generate-content']),
  baseUrl: z.string().trim().min(1).max(500),
  defaultModelId: z.string().trim().min(1).max(200),
  models: z.array(providerModelConfigSchema).min(1).max(100),
  authMode: z.enum(['bearer', 'x-api-key', 'api-key', 'none']),
  timeoutMs: z.number().int().min(5000).max(180000),
  extraHeaders: z.record(z.string(), z.string()),
  hasApiKey: z.boolean().optional(),
})

const providerProfileV1Schema = z.object({
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

function catalogConfig(presetId: string, enabledOverride?: boolean): ProviderModelConfigV2[] {
  return catalogModelsForProvider(presetId).map((model) => ({
    modelId: model.id,
    enabled: enabledOverride ?? model.enabledByDefault,
    label: model.label,
    status: model.status,
    capabilities: [...model.capabilities],
    contextTurns: 12,
    capabilityMode: 'auto',
    extraBody: (model.defaultExtraBody ?? {}) as Record<string, JsonValue>,
  }))
}

function mergeCatalogModels(presetId: string, savedModels: ProviderModelConfigV2[]): ProviderModelConfigV2[] {
  const saved = new Map(savedModels.map((model) => [model.modelId, model]))
  const catalog = catalogConfig(presetId, false).map((model) => saved.get(model.modelId) ?? model)
  const catalogIds = new Set(catalog.map((model) => model.modelId))
  return [...savedModels.filter((model) => !catalogIds.has(model.modelId)), ...catalog]
}

export const providerProfileSchema = z.union([providerProfileV2Schema, providerProfileV1Schema]).transform((profile): ProviderProfileV2 => {
  if (profile.schemaVersion === 2) return { ...profile, models: mergeCatalogModels(profile.presetId, profile.models) }
  const migratedModel: ProviderModelConfigV2 = {
    modelId: profile.model,
    enabled: true,
    temperature: profile.temperature,
    topP: profile.topP,
    maxOutputTokens: profile.maxOutputTokens,
    contextTurns: profile.contextTurns,
    capabilityMode: profile.capabilityMode,
    extraBody: profile.extraBody,
  }
  return {
    schemaVersion: 2,
    id: profile.id,
    presetId: profile.presetId,
    displayName: profile.displayName,
    transport: profile.transport,
    baseUrl: profile.baseUrl,
    defaultModelId: profile.model,
    models: mergeCatalogModels(profile.presetId, [migratedModel]),
    authMode: profile.authMode,
    timeoutMs: profile.timeoutMs,
    extraHeaders: profile.extraHeaders,
    hasApiKey: profile.hasApiKey,
  }
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

export function validateProviderProfile(profile: ProviderProfileV2 | ProviderProfileV1): ProviderProfileV2 {
  const parsed = providerProfileSchema.parse(profile)
  if (new Set(parsed.models.map((model) => model.modelId)).size !== parsed.models.length) throw new Error('同一服务内不能添加重复的模型 ID')
  const defaultModel = parsed.models.find((model) => model.modelId === parsed.defaultModelId)
  if (!defaultModel) throw new Error('默认模型不在当前服务的模型列表中')
  if (!defaultModel.enabled) throw new Error('默认模型必须显示在助手选择器中')
  if (JSON.stringify({ headers: parsed.extraHeaders, bodies: parsed.models.map((model) => model.extraBody) }).length > 100_000) throw new Error('高级请求参数超过 100 KB 安全上限')
  validateProviderUrl(parsed.baseUrl)
  for (const key of Object.keys(parsed.extraHeaders)) {
    if (RESERVED_HEADERS.has(key.toLocaleLowerCase('en-US'))) {
      throw new Error(`额外请求头不能覆盖 ${key}`)
    }
  }
  for (const model of parsed.models) {
    for (const key of Object.keys(model.extraBody)) {
      if (RESERVED_BODY_KEYS.has(key)) throw new Error(`额外参数不能覆盖 ${key}`)
    }
  }
  return parsed
}

export function resolveProviderModel(profile: ProviderProfileV2, modelId = profile.defaultModelId): ProviderModelConfigV2 {
  const model = profile.models.find((candidate) => candidate.modelId === modelId)
  if (!model) throw new Error('所选模型不属于当前服务连接')
  return model
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

export function createProviderProfile(presetId: string): ProviderProfileV2 {
  const preset = PROVIDER_PRESETS.find((candidate) => candidate.id === presetId) ?? PROVIDER_PRESETS[0]
  const models = catalogConfig(preset.id)
  if (!models.length) models.push({ modelId: '', enabled: true, contextTurns: 12, capabilityMode: 'auto', extraBody: {} })
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    presetId: preset.id,
    displayName: preset.label,
    transport: preset.transport,
    baseUrl: preset.baseUrl,
    defaultModelId: models[0].modelId,
    models,
    authMode: preset.authMode,
    timeoutMs: 60000,
    extraHeaders: {},
  }
}
