const assert = require('node:assert/strict')
const {
  buildProviderStreamRequest,
  createProviderStreamAccumulator,
  parseProviderResponse,
} = require('../build/electron/provider-protocol.cjs')

function profile(transport, overrides = {}) {
  return {
    schemaVersion: 2,
    id: `contract-${transport}`,
    presetId: 'custom',
    displayName: transport,
    transport,
    baseUrl: 'https://provider.example.test/api',
    defaultModelId: 'contract/model',
    models: [{
      modelId: 'contract/model',
      enabled: true,
      contextTurns: 12,
      capabilityMode: 'tools',
      extraBody: {},
    }],
    authMode: 'bearer',
    timeoutMs: 60_000,
    extraHeaders: {},
    ...overrides,
  }
}

const tools = [{
  name: 'get_pal_profile',
  description: '读取帕鲁资料',
  inputSchema: {
    type: 'object',
    properties: { pal: { type: 'string' } },
    required: ['pal'],
  },
}]

const request = {
  allowTools: true,
  tools,
  messages: [
    { role: 'system', content: '只使用本地证据。' },
    { role: 'user', content: '介绍棉悠悠' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call-1', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }],
    },
    { role: 'tool', name: 'get_pal_profile', toolCallId: 'call-1', content: '{"name":"棉悠悠"}' },
  ],
}

{
  const current = profile('openai-responses')
  const outgoing = buildProviderStreamRequest(current, 'contract-key', request)
  assert.equal(outgoing.url, 'https://provider.example.test/api/responses')
  assert.equal(outgoing.headers.Authorization, 'Bearer contract-key')
  assert.equal(outgoing.body.instructions, '只使用本地证据。')
  assert.equal(outgoing.body.stream, true)
  assert.deepEqual(outgoing.body.tools[0], {
    type: 'function',
    name: 'get_pal_profile',
    description: '读取帕鲁资料',
    parameters: tools[0].inputSchema,
    strict: true,
  })
  assert.equal(outgoing.body.input.at(-1).type, 'function_call_output')

  const parsed = parseProviderResponse(current, {
    output_text: '资料',
    output: [{ type: 'function_call', call_id: 'response-call', name: 'get_pal_profile', arguments: '{"pal":"SheepBall"}' }],
    usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
  })
  assert.deepEqual(parsed, {
    text: '资料',
    toolCalls: [{ id: 'response-call', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }],
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    continuation: {
      transport: 'openai-responses',
      payload: [{ type: 'function_call', call_id: 'response-call', name: 'get_pal_profile', arguments: '{"pal":"SheepBall"}' }],
    },
  })
  const continued = buildProviderStreamRequest(current, 'contract-key', {
    ...request,
    messages: [...request.messages.slice(0, 2), { ...request.messages[2], continuation: parsed.continuation }, request.messages[3]],
  })
  assert.equal(continued.body.input.at(-2).call_id, 'response-call')
  assert.equal(continued.body.input.at(-1).type, 'function_call_output')

  const stream = createProviderStreamAccumulator(current)
  assert.deepEqual(stream.push({ type: 'response.output_text.delta', delta: '棉悠悠' }), [{ type: 'text-delta', text: '棉悠悠' }])
  stream.push({ type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', call_id: 'stream-call', name: 'get_pal_profile' } })
  stream.push({ type: 'response.function_call_arguments.done', output_index: 0, arguments: '{"pal":"SheepBall"}' })
  assert.deepEqual(stream.result().toolCalls, [{ id: 'stream-call', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }])
  assert.equal(stream.result().continuation.payload[0].arguments, '{"pal":"SheepBall"}')
}

{
  const current = profile('openai-chat')
  const outgoing = buildProviderStreamRequest(current, 'contract-key', request)
  assert.equal(outgoing.url, 'https://provider.example.test/api/chat/completions')
  assert.equal(outgoing.body.stream, true)
  assert.deepEqual(outgoing.body.stream_options, { include_usage: true })
  assert.equal(outgoing.body.messages.at(-1).tool_call_id, 'call-1')
  assert.equal(outgoing.body.tools[0].function.name, 'get_pal_profile')

  const parsed = parseProviderResponse(current, {
    choices: [{ message: { content: '资料', reasoning_content: '内部推理', tool_calls: [{ id: 'chat-call', function: { name: 'get_pal_profile', arguments: '{"pal":"SheepBall"}' } }] } }],
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  })
  assert.equal(parsed.text, '资料')
  assert.deepEqual(parsed.toolCalls[0], { id: 'chat-call', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } })
  assert.equal(parsed.usage.totalTokens, 7)
  assert.deepEqual(parsed.continuation, { transport: 'openai-chat', payload: { reasoning_content: '内部推理' } })
  const continued = buildProviderStreamRequest(current, 'contract-key', {
    ...request,
    messages: [...request.messages.slice(0, 2), { ...request.messages[2], continuation: parsed.continuation }, request.messages[3]],
  })
  assert.equal(continued.body.messages.at(-2).reasoning_content, '内部推理')

  const stream = createProviderStreamAccumulator(current)
  stream.push({ choices: [{ delta: { content: '棉', reasoning_content: '内部推理', tool_calls: [{ index: 0, id: 'chat-stream', function: { name: 'get_pal_profile', arguments: '{"pal":' } }] } }] })
  stream.push({ choices: [{ delta: { content: '悠悠', tool_calls: [{ index: 0, function: { arguments: '"SheepBall"}' } }] } }], usage: { total_tokens: 7 } })
  assert.deepEqual(stream.result(), {
    text: '棉悠悠',
    toolCalls: [{ id: 'chat-stream', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }],
    usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: 7 },
    continuation: { transport: 'openai-chat', payload: { reasoning_content: '内部推理' } },
  })
}

{
  const current = profile('anthropic-messages', { authMode: 'x-api-key' })
  const outgoing = buildProviderStreamRequest(current, 'contract-key', request)
  assert.equal(outgoing.url, 'https://provider.example.test/api/v1/messages')
  assert.equal(outgoing.headers['x-api-key'], 'contract-key')
  assert.equal(outgoing.headers['anthropic-version'], '2023-06-01')
  assert.equal(outgoing.body.stream, true)
  assert.equal(outgoing.body.messages.at(-1).content[0].type, 'tool_result')
  assert.equal(outgoing.body.tools[0].input_schema.type, 'object')

  const parsed = parseProviderResponse(current, {
    content: [{ type: 'thinking', thinking: '内部推理', signature: 'signed-context' }, { type: 'text', text: '资料' }, { type: 'tool_use', id: 'anthropic-call', name: 'get_pal_profile', input: { pal: 'SheepBall' } }],
    usage: { input_tokens: 3, output_tokens: 4 },
  })
  assert.deepEqual(parsed.toolCalls[0], { id: 'anthropic-call', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } })
  const continued = buildProviderStreamRequest(current, 'contract-key', {
    ...request,
    messages: [...request.messages.slice(0, 2), { ...request.messages[2], continuation: parsed.continuation }, request.messages[3]],
  })
  assert.equal(continued.body.messages.at(-2).content[0].signature, 'signed-context')

  const stream = createProviderStreamAccumulator(current)
  stream.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'anthropic-stream', name: 'get_pal_profile', input: {} } })
  stream.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"pal":"SheepBall"}' } })
  assert.deepEqual(stream.push({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '棉悠悠' } }), [{ type: 'text-delta', text: '棉悠悠' }])
  assert.deepEqual(stream.result().toolCalls[0], { id: 'anthropic-stream', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } })
  assert.equal(stream.result().continuation.payload[1].text, '棉悠悠')
}

{
  const current = profile('gemini-generate-content', { authMode: 'x-api-key' })
  const outgoing = buildProviderStreamRequest(current, 'contract-key', request)
  assert.equal(outgoing.url, 'https://provider.example.test/api/v1beta/models/contract%2Fmodel:streamGenerateContent?alt=sse')
  assert.equal(outgoing.headers['x-goog-api-key'], 'contract-key')
  assert.equal(outgoing.body.system_instruction.parts[0].text, '只使用本地证据。')
  assert.equal(outgoing.body.contents.at(-1).parts[0].functionResponse.name, 'get_pal_profile')
  assert.equal(outgoing.body.tools[0].functionDeclarations[0].name, 'get_pal_profile')

  const payload = {
    candidates: [{ content: { parts: [{ text: '内部推理', thought: true, thoughtSignature: 'signed-context' }, { text: '资料' }, { functionCall: { name: 'get_pal_profile', args: { pal: 'SheepBall' } } }] } }],
    usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
  }
  assert.deepEqual(parseProviderResponse(current, payload), {
    text: '资料',
    toolCalls: [{ id: 'gemini-call-0', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }],
    usage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    continuation: { transport: 'gemini-generate-content', payload: payload.candidates[0].content.parts },
  })
  const stream = createProviderStreamAccumulator(current)
  assert.deepEqual(stream.push(payload), [{ type: 'text-delta', text: '资料' }])
  assert.deepEqual(stream.result().toolCalls[0], { id: 'gemini-call-2', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } })
  const continued = buildProviderStreamRequest(current, 'contract-key', {
    ...request,
    messages: [...request.messages.slice(0, 2), { ...request.messages[2], continuation: stream.result().continuation }, request.messages[3]],
  })
  assert.equal(continued.body.contents.at(-2).parts[0].thoughtSignature, 'signed-context')
}

console.log('Electron Provider protocol contract passed for four transports.')
