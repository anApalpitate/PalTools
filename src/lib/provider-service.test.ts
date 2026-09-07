// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderProfile, type ProviderProfileV1 } from '../domain/agent'
import { ProviderService } from './provider-service'

function testProfile(presetId = 'openai', modelId = 'test-model') {
  const profile = createProviderProfile(presetId)
  return { ...profile, defaultModelId: modelId, models: [{ ...profile.models[0], modelId }] }
}

beforeEach(() => { localStorage.clear(); delete window.paltoolsAgent; vi.unstubAllGlobals() })
afterEach(() => { delete window.paltoolsAgent; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('web provider service', () => {
  it('persists redacted profile metadata while keeping the API key in memory', async () => {
    const service = new ProviderService()
    const profile = testProfile()
    await service.save(profile, 'top-secret')
    expect(localStorage.getItem('paltools.agent-profiles.v1')).not.toContain('top-secret')
    expect((await service.load()).profiles[0]).toMatchObject({ id: profile.id, hasApiKey: true })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'OK', output: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, { messages: [{ role: 'user', content: 'test' }], tools: [], allowTools: false })).resolves.toMatchObject({ text: 'OK' })
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer top-secret' }), redirect: 'error' }))
  })

  it('migrates stored V1 rows in place and retains unreadable source data', async () => {
    const service = new ProviderService()
    const current = testProfile('deepseek', 'legacy-model')
    const legacy: ProviderProfileV1 = {
      schemaVersion: 1,
      id: current.id,
      presetId: current.presetId,
      displayName: current.displayName,
      transport: current.transport,
      baseUrl: current.baseUrl,
      model: current.defaultModelId,
      authMode: current.authMode,
      timeoutMs: current.timeoutMs,
      contextTurns: 6,
      capabilityMode: 'retrieval-only',
      extraHeaders: {},
      extraBody: { seed: 7 },
    }
    localStorage.setItem('paltools.agent-profiles.v1', JSON.stringify([legacy]))

    await expect(service.load()).resolves.toMatchObject({
      profiles: [{ schemaVersion: 2, id: legacy.id, defaultModelId: legacy.model }],
    })
    expect(JSON.parse(localStorage.getItem('paltools.agent-profiles.v1') ?? '[]')[0]).toMatchObject({
      schemaVersion: 2,
      defaultModelId: legacy.model,
    })

    const unreadable = '[{"schemaVersion":1'
    localStorage.setItem('paltools.agent-profiles.v1', unreadable)
    await expect(service.load()).rejects.toThrow(/原数据已保留/)
    expect(localStorage.getItem('paltools.agent-profiles.v1')).toBe(unreadable)
  })

  it('deletes the in-memory key when a provider switch explicitly clears it', async () => {
    const service = new ProviderService()
    const profile = testProfile()
    await service.save(profile, 'old-provider-secret')

    const switchedProfile = { ...profile, presetId: 'custom', displayName: '自定义兼容接口', baseUrl: 'https://models.example.com/v1' }
    await service.save(switchedProfile, '')

    expect((await service.load()).profiles[0]).toMatchObject({ id: profile.id, hasApiKey: false })
    vi.stubGlobal('fetch', vi.fn())
    await expect(service.complete(switchedProfile, { messages: [{ role: 'user', content: 'test' }], tools: [], allowTools: false })).rejects.toThrow(/重新填写密钥/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('invalidates a Web key when its credential scope changes without an explicit key value', async () => {
    const service = new ProviderService()
    const profile = testProfile()
    await service.save(profile, 'old-provider-secret')

    const movedProfile = { ...profile, baseUrl: 'https://models.example.com/v1' }
    await service.save(movedProfile)

    expect((await service.load()).profiles[0]).toMatchObject({ id: profile.id, hasApiKey: false })
  })

  it('passes an explicit key deletion to the Electron bridge when credential scope changes', async () => {
    const existing = { ...testProfile(), id: 'electron-profile', hasApiKey: true }
    const saveProfile = vi.fn().mockResolvedValue(undefined)
    window.paltoolsAgent = {
      listProfiles: vi.fn().mockResolvedValue({ profiles: [existing], defaultProfileId: existing.id, encryptionAvailable: true }),
      saveProfile,
      removeProfile: vi.fn(),
      setDefaultProfile: vi.fn(),
      complete: vi.fn(),
      cancel: vi.fn(),
      subscribe: vi.fn().mockReturnValue(() => undefined),
    }
    const service = new ProviderService()
    const movedProfile = { ...existing, baseUrl: 'https://models.example.com/v1' }

    await expect(service.load()).resolves.toMatchObject({ managedProfileIds: [], platform: 'electron' })

    await service.save(movedProfile)

    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ id: existing.id, baseUrl: movedProfile.baseUrl }), '')
  })

  it('emits safe text deltas from an SSE response', async () => {
    const service = new ProviderService()
    const profile = testProfile()
    await service.save(profile, 'secret')
    const stream = ['data: {"type":"response.output_text.delta","delta":"本地"}\n\n', 'data: {"type":"response.output_text.delta","delta":"回答"}\n\n', 'data: [DONE]\n\n'].join('')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })))
    const events: string[] = []
    const result = await service.complete(profile, { messages: [{ role: 'user', content: 'test' }], tools: [], allowTools: false }, undefined, (event) => events.push(event.text))
    expect(result.text).toBe('本地回答')
    expect(events).toEqual(['本地', '回答'])
  })

  it('classifies authentication, rate-limit, cancellation and malformed responses', async () => {
    const service = new ProviderService()
    const profile = testProfile()
    await service.save(profile, 'secret')
    const request = { messages: [{ role: 'user' as const, content: 'test' }], tools: [], allowTools: false }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, request)).rejects.toThrow(/认证失败/)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'quota' } }), { status: 429, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, request)).rejects.toThrow(/请求过于频繁/)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, request)).rejects.toThrow(/无法解析/)

    const controller = new AbortController(); controller.abort()
    await expect(service.complete(profile, request, controller.signal)).rejects.toThrow(/已停止生成/)
  })

  it('never exposes a key reflected by an upstream Web error', async () => {
    const service = new ProviderService()
    const reflectedKey = 'synthetic-web-reflected-key-123456'
    const profile = testProfile()
    const request = { messages: [{ role: 'user' as const, content: 'test' }], tools: [], allowTools: false }
    await service.save(profile, reflectedKey)

    for (const response of [
      new Response(JSON.stringify({ error: { message: reflectedKey } }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
      new Response(JSON.stringify({ error: { message: reflectedKey } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
      let failure: unknown
      try { await service.complete(profile, request) } catch (error) { failure = error }
      expect(failure).toBeInstanceOf(Error)
      expect((failure as Error).message).not.toContain(reflectedKey)
    }
  })

  it('reads normal JSON incrementally and cancels declared or streamed oversized responses', async () => {
    const service = new ProviderService()
    const profile = testProfile()
    const request = { messages: [{ role: 'user' as const, content: 'bounded response' }], tools: [], allowTools: false }
    await service.save(profile, 'synthetic-bounded-response-key')

    const encoder = new TextEncoder()
    const normalPayload = JSON.stringify({ output_text: 'bounded OK', output: [] })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(normalPayload.slice(0, 12)))
        controller.enqueue(encoder.encode(normalPayload.slice(12)))
        controller.close()
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, request)).resolves.toMatchObject({ text: 'bounded OK' })

    let declaredCancelled = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(encoder.encode('{}')) },
      cancel() { declaredCancelled = true },
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': '2000001' } })))
    await expect(service.complete(profile, request)).rejects.toThrow(/响应超过 2 MB/)
    expect(declaredCancelled).toBe(true)

    let streamedCancelled = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_000))
        controller.enqueue(new Uint8Array(1_000_001))
      },
      cancel() { streamedCancelled = true },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, request)).rejects.toThrow(/响应超过 2 MB/)
    expect(streamedCancelled).toBe(true)

    let sseCancelled = false
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1_000_000))
        controller.enqueue(new Uint8Array(1_000_001))
      },
      cancel() { sseCancelled = true },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } })))
    await expect(service.complete(profile, request)).rejects.toThrow(/响应超过 2 MB/)
    expect(sseCancelled).toBe(true)
  })
})
