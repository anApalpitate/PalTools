import { describe, expect, it } from 'vitest'
import { createProviderProfile, PROVIDER_PRESETS, validateProviderProfile, type ProviderModelConfigV2 } from './agent'
import { buildProviderRequest, buildProviderStreamRequest, createProviderStreamAccumulator, parseProviderResponse } from './provider-adapters'

function profileWithModel(presetId: string, modelId = 'model', settings: Record<string, unknown> = {}) {
  const profile = createProviderProfile(presetId)
  return { ...profile, defaultModelId: modelId, models: [{ ...profile.models[0], modelId, ...settings }] }
}

describe('provider adapters', () => {
  it('builds OpenAI-compatible chat requests without allowing reserved overrides', () => {
    const profile = profileWithModel('deepseek', 'test-model', { maxOutputTokens: 512 })
    const request = buildProviderRequest(profile, 'secret', { allowTools: true, messages: [{ role: 'system', content: 'system' }, { role: 'user', content: 'hello' }], tools: [{ name: 'search_local_knowledge', description: 'search', inputSchema: { type: 'object' } }] })
    expect(request.url).toBe('https://api.deepseek.com/chat/completions')
    expect(request.headers.Authorization).toBe('Bearer secret')
    expect(request.body.model).toBe('test-model')
    expect(request.body.tools).toHaveLength(1)
    expect(() => validateProviderProfile({ ...profile, extraHeaders: { Authorization: 'other' } })).toThrow(/不能覆盖/)
  })

  it('targets one model in a shared connection and applies only that model settings', () => {
    const profile = createProviderProfile('deepseek')
    const models = profile.models.map((model): ProviderModelConfigV2 => model.modelId === 'deepseek-v4-pro'
      ? { ...model, temperature: 0.4, maxOutputTokens: 321, extraBody: { reasoning_effort: 'high' } }
      : { ...model, temperature: undefined, maxOutputTokens: undefined, extraBody: {} })
    const configured = { ...profile, models }
    const request = buildProviderRequest(configured, 'secret', {
      modelId: 'deepseek-v4-pro',
      allowTools: false,
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
    })
    expect(request.body).toMatchObject({
      model: 'deepseek-v4-pro',
      temperature: 0.4,
      max_tokens: 321,
      reasoning_effort: 'high',
    })
    expect(() => buildProviderRequest(configured, 'secret', {
      modelId: 'outside-model', allowTools: false, messages: [], tools: [],
    })).toThrow(/不属于当前服务连接/)
  })

  it('maps native Responses, Anthropic and Gemini contracts', () => {
    const common = { allowTools: false, tools: [], messages: [{ role: 'system' as const, content: 'system' }, { role: 'user' as const, content: 'hello' }] }
    const openai = profileWithModel('openai')
    expect(buildProviderRequest(openai, 'key', common).url).toBe('https://api.openai.com/v1/responses')
    expect(parseProviderResponse(openai, { output_text: 'ok', output: [], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } })).toMatchObject({ text: 'ok', usage: { totalTokens: 3 } })

    const anthropic = profileWithModel('anthropic')
    expect(buildProviderRequest(anthropic, 'key', common).headers['anthropic-version']).toBe('2023-06-01')
    expect(parseProviderResponse(anthropic, { content: [{ type: 'tool_use', id: 'a', name: 'get_pal_profile', input: { pal: '棉悠悠' } }] }).toolCalls[0]).toMatchObject({ name: 'get_pal_profile' })

    const gemini = profileWithModel('gemini')
    const geminiRequest = buildProviderRequest(gemini, 'key', common)
    expect(geminiRequest.headers['x-goog-api-key']).toBe('key')
    expect(geminiRequest.url).toContain('model:generateContent')
  })

  it('omits tools and vendor tool choice fields in retrieval-only requests', () => {
    const request = {
      allowTools: false,
      messages: [{ role: 'user' as const, content: '使用已提供的本地结果回答' }],
      tools: [{ name: 'get_pal_profile' as const, description: '本地帕鲁资料', inputSchema: { type: 'object' } }],
    }
    for (const presetId of ['openai', 'deepseek', 'anthropic', 'gemini']) {
      const outgoing = buildProviderRequest(profileWithModel(presetId), 'key', request)
      expect(outgoing.body).not.toHaveProperty('tools')
      expect(outgoing.body).not.toHaveProperty('tool_choice')
    }
  })

  it('rejects unsafe remote URLs but permits local Ollama HTTP', () => {
    expect(() => validateProviderProfile({ ...profileWithModel('custom', 'm'), baseUrl: 'http://example.com/v1' })).toThrow(/HTTPS/)
    expect(() => validateProviderProfile(profileWithModel('ollama', 'm'))).not.toThrow()
  })

  it('keeps profile validation at the public adapter boundary', () => {
    const unsafe = { ...profileWithModel('custom', 'm'), baseUrl: 'http://example.com/v1' }
    const request = { allowTools: false, messages: [], tools: [] }
    expect(() => buildProviderRequest(unsafe, 'key', request)).toThrow(/HTTPS/)
    expect(() => buildProviderStreamRequest(unsafe, 'key', request)).toThrow(/HTTPS/)
    expect(() => createProviderStreamAccumulator(unsafe)).toThrow(/HTTPS/)
    expect(() => parseProviderResponse(unsafe, {})).toThrow(/HTTPS/)
  })

  it('keeps every named provider template on an approved transport and authentication contract', () => {
    expect(PROVIDER_PRESETS.map((preset) => preset.id)).toEqual([
      'openai', 'anthropic', 'gemini', 'deepseek', 'glm', 'qwen-cn', 'kimi', 'openrouter', 'ollama', 'custom',
    ])
    expect(PROVIDER_PRESETS.find((preset) => preset.id === 'qwen-cn')).toMatchObject({
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      label: '通义千问（中国内地）',
    })
    for (const preset of PROVIDER_PRESETS.filter((candidate) => candidate.id !== 'custom')) {
      const url = new URL(preset.baseUrl)
      expect(url.protocol === 'https:' || (preset.id === 'ollama' && url.hostname === '127.0.0.1')).toBe(true)
      expect(['openai-responses', 'openai-chat', 'anthropic-messages', 'gemini-generate-content']).toContain(preset.transport)
      expect(['bearer', 'x-api-key', 'api-key', 'none']).toContain(preset.authMode)
      expect(preset.docsUrl).toMatch(/^https:\/\//)
    }
  })

  it('accumulates text, tools and usage from all streaming transports', () => {
    const openAi = profileWithModel('openai')
    expect(buildProviderStreamRequest(openAi, 'key', { messages: [], tools: [], allowTools: false }).body.stream).toBe(true)
    const responses = createProviderStreamAccumulator(openAi)
    expect(responses.push({ type: 'response.output_text.delta', delta: '你好' })).toEqual([{ type: 'text-delta', text: '你好' }])
    responses.push({ type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', call_id: 'call-1', name: 'get_pal_profile' } })
    responses.push({ type: 'response.function_call_arguments.done', output_index: 1, arguments: '{"pal":"棉悠悠"}' })
    expect(responses.result()).toMatchObject({ text: '你好', toolCalls: [{ id: 'call-1', name: 'get_pal_profile', arguments: { pal: '棉悠悠' } }] })

    const chat = createProviderStreamAccumulator(profileWithModel('deepseek'))
    chat.push({ choices: [{ delta: { content: '结论', tool_calls: [{ index: 0, id: 'c', function: { name: 'compare_pals', arguments: '{"pals":' } }] } }] })
    chat.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '["A","B"]}' } }] } }], usage: { total_tokens: 9 } })
    expect(chat.result()).toMatchObject({ text: '结论', toolCalls: [{ name: 'compare_pals', arguments: { pals: ['A', 'B'] } }], usage: { totalTokens: 9 } })

    const anthropic = createProviderStreamAccumulator(profileWithModel('anthropic'))
    anthropic.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'a', name: 'find_drop_sources', input: {} } })
    anthropic.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"item":"羊毛"}' } })
    expect(anthropic.result().toolCalls[0]).toMatchObject({ name: 'find_drop_sources', arguments: { item: '羊毛' } })

    const geminiProfile = profileWithModel('gemini')
    expect(buildProviderStreamRequest(geminiProfile, 'key', { messages: [], tools: [], allowTools: false }).url).toContain(':streamGenerateContent?alt=sse')
    const gemini = createProviderStreamAccumulator(geminiProfile)
    gemini.push({ candidates: [{ content: { parts: [{ text: '完成' }, { functionCall: { name: 'get_pal_profile', args: { pal: '棉悠悠' } } }] } }] })
    expect(gemini.result()).toMatchObject({ text: '完成', toolCalls: [{ name: 'get_pal_profile', arguments: { pal: '棉悠悠' } }] })
  })
})
