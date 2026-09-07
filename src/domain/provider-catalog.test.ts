import { describe, expect, it } from 'vitest'
import { createProviderProfile, providerProfileSchema, validateProviderProfile, type ProviderProfileV1 } from './agent'
import { PROVIDER_MODEL_CATALOG } from './provider-catalog'

describe('provider model catalog', () => {
  it('ships the approved first-wave model ids and default visibility', () => {
    expect(Object.fromEntries(Object.entries(PROVIDER_MODEL_CATALOG).map(([provider, models]) => [
      provider,
      models.map((model) => `${model.enabledByDefault ? '+' : '-'}${model.id}`),
    ]))).toEqual({
      deepseek: ['+deepseek-v4-flash', '+deepseek-v4-pro', '-deepseek-v4-flash-vision-exp'],
      glm: ['+glm-5.3-flash', '+glm-5.3'],
      openai: ['+gpt-5.6-luna', '+gpt-5.6-sol', '-gpt-5.6-terra', '-gpt-6-astra'],
      anthropic: ['+claude-haiku-4-5-20251001', '+claude-sonnet-5', '-claude-opus-5', '-claude-fable-5-1'],
      gemini: ['+gemini-3.5-flash-lite', '+gemini-3.8-flash', '-gemini-3.1-pro-preview'],
      'qwen-cn': ['+qwen3.8-flash', '+qwen3.7-plus', '-qwen3.8-max'],
      kimi: ['+kimi-k2.6', '+kimi-k3'],
      openrouter: ['+deepseek/deepseek-v4-flash-0731', '+z-ai/glm-5.3-flash'],
      ollama: ['+qwen3.5:4b', '-qwen3.5:9b'],
      custom: [],
    })
  })

  it('creates each preset with its first visible model as the connection default', () => {
    for (const provider of Object.keys(PROVIDER_MODEL_CATALOG).filter((id) => id !== 'custom')) {
      const profile = createProviderProfile(provider)
      expect(profile.defaultModelId).toBe(PROVIDER_MODEL_CATALOG[provider][0].id)
      expect(profile.models.find((model) => model.modelId === profile.defaultModelId)?.enabled).toBe(true)
    }
  })

  it('migrates a V1 row without merging it into another connection or losing model parameters', () => {
    const legacy: ProviderProfileV1 = {
      schemaVersion: 1,
      id: 'legacy-deepseek',
      presetId: 'deepseek',
      displayName: '旧 DeepSeek',
      transport: 'openai-chat',
      baseUrl: 'https://api.deepseek.com',
      model: 'legacy-private-model',
      authMode: 'bearer',
      temperature: 0.3,
      topP: 0.8,
      maxOutputTokens: 2048,
      timeoutMs: 45000,
      contextTurns: 7,
      capabilityMode: 'retrieval-only',
      extraHeaders: { 'x-client': 'paltools' },
      extraBody: { seed: 42 },
      hasApiKey: true,
    }
    const migrated = providerProfileSchema.parse(legacy)
    expect(migrated).toMatchObject({
      schemaVersion: 2,
      id: legacy.id,
      defaultModelId: legacy.model,
      hasApiKey: true,
    })
    expect(migrated.models[0]).toMatchObject({
      modelId: legacy.model,
      enabled: true,
      temperature: 0.3,
      topP: 0.8,
      maxOutputTokens: 2048,
      contextTurns: 7,
      capabilityMode: 'retrieval-only',
      extraBody: { seed: 42 },
    })
    expect(migrated.models.filter((model) => model.modelId.startsWith('deepseek-v4'))).toHaveLength(3)
    expect(migrated.models.filter((model) => model.modelId.startsWith('deepseek-v4')).every((model) => !model.enabled)).toBe(true)
  })

  it('requires the connection default to stay visible', () => {
    const profile = createProviderProfile('openai')
    const hidden = {
      ...profile,
      models: profile.models.map((model) => model.modelId === profile.defaultModelId ? { ...model, enabled: false } : model),
    }
    expect(() => validateProviderProfile(hidden)).toThrow(/默认模型必须显示/)
  })
})
