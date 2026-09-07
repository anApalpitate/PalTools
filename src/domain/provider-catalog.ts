export type ProviderModelStatus = 'stable' | 'preview' | 'experimental'
export type ProviderModelCapability = 'text' | 'tools' | 'vision'

export interface ProviderCatalogModel {
  id: string
  label: string
  enabledByDefault: boolean
  status: ProviderModelStatus
  capabilities: ProviderModelCapability[]
  defaultExtraBody?: Record<string, unknown>
}

const textTools = ['text', 'tools'] as const
const visionTools = ['text', 'tools', 'vision'] as const

export const PROVIDER_MODEL_CATALOG: Record<string, ProviderCatalogModel[]> = {
  deepseek: [
    { id: 'deepseek-v4-flash', label: 'DeepSeek V4 Flash', enabledByDefault: true, status: 'stable', capabilities: [...textTools], defaultExtraBody: { thinking: { type: 'disabled' } } },
    { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro', enabledByDefault: true, status: 'stable', capabilities: [...textTools], defaultExtraBody: { thinking: { type: 'disabled' } } },
    { id: 'deepseek-v4-flash-vision-exp', label: 'DeepSeek V4 Flash Vision', enabledByDefault: false, status: 'experimental', capabilities: [...visionTools], defaultExtraBody: { thinking: { type: 'disabled' } } },
  ],
  glm: [
    { id: 'glm-5.3-flash', label: 'GLM-5.3 Flash', enabledByDefault: true, status: 'stable', capabilities: [...textTools], defaultExtraBody: { thinking: { type: 'enabled' }, reasoning_effort: 'low' } },
    { id: 'glm-5.3', label: 'GLM-5.3', enabledByDefault: true, status: 'stable', capabilities: [...textTools], defaultExtraBody: { thinking: { type: 'enabled' }, reasoning_effort: 'low' } },
  ],
  openai: [
    { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', enabledByDefault: false, status: 'stable', capabilities: [...visionTools] },
    { id: 'gpt-6-astra', label: 'GPT-6 Astra', enabledByDefault: false, status: 'stable', capabilities: [...visionTools] },
  ],
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'claude-opus-5', label: 'Claude Opus 5', enabledByDefault: false, status: 'stable', capabilities: [...visionTools] },
    { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', enabledByDefault: false, status: 'stable', capabilities: [...visionTools] },
  ],
  gemini: [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', enabledByDefault: false, status: 'preview', capabilities: [...visionTools] },
  ],
  'qwen-cn': [
    { id: 'qwen3.8-flash', label: 'Qwen 3.8 Flash', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'qwen3.7-plus', label: 'Qwen 3.7 Plus', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'qwen3.8-max', label: 'Qwen 3.8 Max', enabledByDefault: false, status: 'stable', capabilities: [...visionTools] },
  ],
  kimi: [
    { id: 'kimi-k2.6', label: 'Kimi K2.6', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'kimi-k3', label: 'Kimi K3', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
  ],
  openrouter: [
    { id: 'deepseek/deepseek-v4-flash-0731', label: 'DeepSeek V4 Flash 0731', enabledByDefault: true, status: 'stable', capabilities: [...textTools] },
    { id: 'z-ai/glm-5.3-flash', label: 'GLM-5.3 Flash', enabledByDefault: true, status: 'stable', capabilities: [...textTools] },
  ],
  ollama: [
    { id: 'qwen3.5:4b', label: 'Qwen 3.5 4B', enabledByDefault: true, status: 'stable', capabilities: [...visionTools] },
    { id: 'qwen3.5:9b', label: 'Qwen 3.5 9B', enabledByDefault: false, status: 'stable', capabilities: [...visionTools] },
  ],
  custom: [],
}

export function catalogModelsForProvider(presetId: string): ProviderCatalogModel[] {
  return PROVIDER_MODEL_CATALOG[presetId] ?? []
}

export function catalogModel(presetId: string, modelId: string): ProviderCatalogModel | undefined {
  return catalogModelsForProvider(presetId).find((model) => model.id === modelId)
}
