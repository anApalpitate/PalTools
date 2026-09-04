// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderProfile } from '../domain/agent'
import { ProviderService } from './provider-service'

beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('web provider service', () => {
  it('persists redacted profile metadata while keeping the API key in memory', async () => {
    const service = new ProviderService()
    const profile = { ...createProviderProfile('openai'), model: 'test-model' }
    await service.save(profile, 'top-secret')
    expect(localStorage.getItem('paltools.agent-profiles.v1')).not.toContain('top-secret')
    expect((await service.load()).profiles[0]).toMatchObject({ id: profile.id, hasApiKey: true })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: 'OK', output: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    await expect(service.complete(profile, { messages: [{ role: 'user', content: 'test' }], tools: [], allowTools: false })).resolves.toMatchObject({ text: 'OK' })
    expect(fetch).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer top-secret' }), redirect: 'error' }))
  })

  it('emits safe text deltas from an SSE response', async () => {
    const service = new ProviderService()
    const profile = { ...createProviderProfile('openai'), model: 'test-model' }
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
    const profile = { ...createProviderProfile('openai'), model: 'test-model' }
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
})
