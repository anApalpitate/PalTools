import { describe, expect, it, vi } from 'vitest'
import type { ActiveSkillRecord, PalRecord } from './types'
import { createProviderProfile } from './agent'
import { AssistantMentionError, bindAssistantToolMentions, runPalAgent } from './agent-runner'
import type { AssistantMentionV1, KnowledgeEvidence, LocalToolName } from './knowledge-contract'
import { LocalKnowledgeService } from './knowledge'

const pal: PalRecord = { internalId: 'SheepBall', paldbId: 'Lamball', paldexNo: '001', name: { zhHans: '棉悠悠', en: 'Lamball' }, elements: ['neutral'], rarity: 1, workSuitabilities: { 手工作业: 1 }, partnerSkill: null, stats: { hp: 70, attack: 70, defense: 70, workSpeed: 100, walkSpeed: 40, runSpeed: 400, swimSpeed: 120, rideSprintSpeed: 550, transportSpeed: 160, stamina: 100, foodAmount: 3 }, statSources: {}, activeSkills: [], passiveSkills: [], drops: [], image: { localPath: '/pal.webp', sourceUrl: 'https://example.com', sha256: 'a'.repeat(64) }, sourceUrl: 'https://example.com' }

function tool(name: LocalToolName, args: Record<string, string> = {}): AssistantMentionV1 { return { kind: 'tool', name, label: name, arguments: args } }
const lamballMention: AssistantMentionV1 = { kind: 'entity', entityType: 'pal', id: 'SheepBall', label: '棉悠悠' }
const cattivaMention: AssistantMentionV1 = { kind: 'entity', entityType: 'pal', id: 'PinkCat', label: '捣蛋猫' }
const itemMention: AssistantMentionV1 = { kind: 'entity', entityType: 'item', id: 'Wool', label: '羊毛' }
const skillMention: AssistantMentionV1 = { kind: 'entity', entityType: 'skill', id: 'Roly', label: '滚滚毛球' }

describe('Pal agent runner', () => {
  it('sends local evidence and completes a validated tool loop', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn()
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'call-1', name: 'get_pal_profile', arguments: { pal: '棉悠悠' } }] })
      .mockResolvedValueOnce({ text: '棉悠悠有手工作业 Lv.1。', toolCalls: [] })
    const result = await runPalAgent({ question: '棉悠悠适合做什么？', history: [], profile: { ...createProviderProfile('openai'), model: 'm' }, knowledge, complete })
    expect(result.text).toContain('手工作业')
    expect(result.traces.some((trace) => trace.tool === 'get_pal_profile')).toBe(true)
    expect(result.evidence.some((item) => item.id === 'pal:SheepBall')).toBe(true)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('does not call a model when local knowledge has no evidence', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn()
    const result = await runPalAgent({ question: '完全不存在的资料', history: [], profile: { ...createProviderProfile('openai'), model: 'm' }, knowledge, complete })
    expect(result.text).toContain('没有足够依据')
    expect(complete).not.toHaveBeenCalled()
  })

  it('binds all eight local tools to stable entity ids', () => {
    expect(bindAssistantToolMentions('查一下', [tool('search_local_knowledge'), lamballMention]).calls[0].arguments).toMatchObject({ query: '查一下' })
    expect(bindAssistantToolMentions('', [tool('get_pal_profile'), lamballMention]).calls[0].arguments).toEqual({ pal: 'SheepBall' })
    expect(bindAssistantToolMentions('', [tool('compare_pals'), lamballMention, cattivaMention]).calls[0].arguments).toEqual({ pals: ['SheepBall', 'PinkCat'] })
    expect(bindAssistantToolMentions('', [tool('find_child_by_parents'), lamballMention, cattivaMention]).calls[0].arguments).toEqual({ parentA: 'SheepBall', parentB: 'PinkCat' })
    expect(() => bindAssistantToolMentions('', [tool('find_child_by_parents'), lamballMention])).toThrow('显式确认')
    expect(bindAssistantToolMentions('', [tool('find_child_by_parents', { parentA: 'SheepBall', parentB: 'SheepBall' }), lamballMention]).calls[0].arguments).toEqual({ parentA: 'SheepBall', parentB: 'SheepBall' })
    expect(bindAssistantToolMentions('', [tool('find_children_for_parent'), lamballMention]).calls[0].arguments).toMatchObject({ parent: 'SheepBall' })
    expect(bindAssistantToolMentions('', [tool('find_parents_for_child'), lamballMention]).calls[0].arguments).toMatchObject({ child: 'SheepBall' })
    expect(bindAssistantToolMentions('', [tool('find_drop_sources'), itemMention]).calls[0].arguments).toMatchObject({ item: 'Wool' })
    expect(bindAssistantToolMentions('', [tool('find_skill_owners'), skillMention]).calls[0].arguments).toMatchObject({ skill: 'Roly' })
    expect(bindAssistantToolMentions('', [tool('get_pal_profile'), lamballMention]).mentions[0]).toMatchObject({ kind: 'tool', arguments: { pal: 'SheepBall' } })
    const thirdPal = { kind: 'entity', entityType: 'pal', id: 'NegativeKoala', label: '寐魔' } as const
    expect(() => bindAssistantToolMentions('', [tool('find_child_by_parents'), lamballMention, cattivaMention, thirdPal])).toThrow('只能引用 2 只亲本')
    expect(() => bindAssistantToolMentions('', [tool('compare_pals'), lamballMention, cattivaMention, thirdPal, { ...thirdPal, id: 'Pal4' }, { ...thirdPal, id: 'Pal5' }])).toThrow('请引用 2–4 只帕鲁')
  })

  it('rejects incomplete explicit tool arguments before calling the provider', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn()
    await expect(runPalAgent({
      question: '',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm' },
      knowledge,
      mentions: [tool('compare_pals'), lamballMention],
      complete,
    })).rejects.toThrow(AssistantMentionError)
    expect(complete).not.toHaveBeenCalled()
  })

  it('runs explicit tools before retrieval, includes full results, and supports retrieval-only profiles', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn().mockResolvedValue({ text: '棉悠悠适合手工作业。', toolCalls: [] })
    const result = await runPalAgent({
      question: '怎么配出棉悠悠？',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'retrieval-only' },
      knowledge,
      mentions: [tool('get_pal_profile'), lamballMention],
      complete,
    })
    expect(result.traces.map((trace) => trace.source)).toEqual(['mention', 'pre-retrieval'])
    expect(result.traces.filter((trace) => trace.tool === 'find_parents_for_child')).toHaveLength(0)
    expect(complete).toHaveBeenCalledTimes(1)
    expect(complete.mock.calls[0][0].allowTools).toBe(false)
    const userMessage = complete.mock.calls[0][0].messages.at(-1)
    expect(userMessage.content).toContain('workSuitabilities')
    expect(userMessage.content).toContain('SheepBall')
  })

  it('keeps four complete comparison cores in a valid structured result packet', async () => {
    const detailedSkill: ActiveSkillRecord = { id: 'DetailedSkill', name: '详细技能', element: 'neutral', attackType: 'melee', power: 40, cooldownSeconds: 2, attackRange: '0-1000', effects: [], description: '很长的技能说明。'.repeat(300), sourceUrl: 'https://example.com/skill' }
    const pals = Array.from({ length: 4 }, (_, index): PalRecord => ({
      ...pal,
      internalId: `Pal${index + 1}`,
      paldbId: `pal-${index + 1}`,
      paldexNo: String(index + 1).padStart(3, '0'),
      name: { zhHans: `测试帕鲁${index + 1}`, en: `Test Pal ${index + 1}` },
      stats: { ...pal.stats, hp: 70 + index },
      activeSkills: Array.from({ length: 24 }, (_, skillIndex) => ({ skillId: detailedSkill.id, unlockLevel: skillIndex + 1 })),
      passiveSkills: Array.from({ length: 24 }, (_, passiveIndex) => ({ name: `词条${passiveIndex}`, description: '很长的词条说明。'.repeat(100), rank: 1 })),
    }))
    const knowledge = new LocalKnowledgeService({ pals, skills: [detailedSkill], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn().mockResolvedValue({ text: '比较完成。', toolCalls: [] })
    const mentions: AssistantMentionV1[] = [
      tool('compare_pals'),
      ...pals.map((entry): AssistantMentionV1 => ({ kind: 'entity', entityType: 'pal', id: entry.internalId, label: entry.name.zhHans })),
    ]

    await runPalAgent({ question: '', history: [], profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'retrieval-only' }, knowledge, mentions, complete })

    const prompt = complete.mock.calls[0][0].messages.at(-1)?.content ?? ''
    const packet = JSON.parse(prompt.split('预执行的本地工具结果：\n')[1]) as Array<{ content: Array<{ id: string; stats: { hp: number } }> }>
    expect(packet[0].content.map((entry) => entry.id)).toEqual(['Pal1', 'Pal2', 'Pal3', 'Pal4'])
    expect(packet[0].content.map((entry) => entry.stats.hp)).toEqual([70, 71, 72, 73])
  })

  it('runs an argument-complete mention with no text or pre-retrieval hit', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn().mockResolvedValue({ text: '已读取棉悠悠。', toolCalls: [] })
    const result = await runPalAgent({
      question: '',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'retrieval-only' },
      knowledge,
      mentions: [{ kind: 'tool', name: 'get_pal_profile', label: '帕鲁资料', arguments: { pal: 'SheepBall' } }],
      complete,
    })
    expect(result.text).toContain('棉悠悠')
    expect(result.traces).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'mention', resultCount: 1 }), expect.objectContaining({ source: 'pre-retrieval', resultCount: 0 })]))
    expect(complete.mock.calls[0][0].allowTools).toBe(false)
  })

  it('uses exact entity evidence even when the free text has no match', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn().mockResolvedValue({ text: '已读取指定帕鲁。', toolCalls: [] })
    const result = await runPalAgent({
      question: '完全不存在的描述',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm' },
      knowledge,
      mentions: [lamballMention],
      complete,
    })
    expect(result.evidence.some((item) => item.id === 'pal:SheepBall')).toBe(true)
    expect(complete).toHaveBeenCalledOnce()
  })

  it('honors an already-aborted request before any provider call', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const complete = vi.fn()
    const controller = new AbortController()
    controller.abort(new DOMException('已停止', 'AbortError'))
    await expect(runPalAgent({
      question: '棉悠悠',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm' },
      knowledge,
      signal: controller.signal,
      complete,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(complete).not.toHaveBeenCalled()
  })

  it('does not execute or enter another round when cancelled after a provider response', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const execute = vi.spyOn(knowledge, 'execute')
    const controller = new AbortController()
    const complete = vi.fn().mockImplementationOnce(async () => {
      controller.abort(new DOMException('已停止', 'AbortError'))
      return { text: '', toolCalls: [{ id: 'call-1', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }] }
    })

    await expect(runPalAgent({
      question: '棉悠悠',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm' },
      knowledge,
      signal: controller.signal,
      complete,
    })).rejects.toMatchObject({ name: 'AbortError' })

    expect(execute).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
  })

  it('never executes provider-requested tools in retrieval-only mode', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const execute = vi.spyOn(knowledge, 'execute')
    const complete = vi.fn().mockResolvedValue({ text: '仅整理现有证据。', toolCalls: [{ id: 'unexpected', name: 'get_pal_profile', arguments: { pal: 'SheepBall' } }] })

    const result = await runPalAgent({
      question: '棉悠悠',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'retrieval-only' },
      knowledge,
      complete,
    })

    expect(result.text).toBe('仅整理现有证据。')
    expect(execute).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
  })

  it('stops before executing an oversized batch of model tool calls', async () => {
    const knowledge = new LocalKnowledgeService({ pals: [pal], skills: [], items: [], breedingIndex: null, datasetVersion: 'v1' })
    const execute = vi.spyOn(knowledge, 'execute')
    const complete = vi.fn().mockResolvedValue({
      text: '',
      toolCalls: Array.from({ length: 9 }, (_, index) => ({ id: `call-${index}`, name: 'get_pal_profile', arguments: { pal: 'SheepBall' } })),
    })

    const result = await runPalAgent({
      question: '棉悠悠',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'tools' },
      knowledge,
      complete,
    })

    expect(result.text).toContain('超过 8 次安全上限')
    expect(execute).not.toHaveBeenCalled()
  })

  it('keeps an explicitly referenced pal ahead of a full page of recipe evidence', async () => {
    const referencedPal: KnowledgeEvidence = { id: 'pal:SheepBall', kind: 'pal', title: '棉悠悠', summary: '指定亲本', matchedFields: ['entity-reference'], score: 24, datasetVersion: 'v1' }
    const recipeEvidence: KnowledgeEvidence[] = Array.from({ length: 20 }, (_, index) => ({ id: `recipe:${index}`, kind: 'recipe', title: `配方 ${index}`, summary: '配方证据', matchedFields: ['recipe'], score: 1, datasetVersion: 'v1' }))
    const knowledge = {
      evidenceForEntity: vi.fn().mockReturnValue(referencedPal),
      preRetrieve: vi.fn().mockReturnValue([]),
      execute: vi.fn().mockResolvedValue({ content: { total: 20, recipes: [] }, evidence: recipeEvidence, trace: { tool: 'find_children_for_parent', label: '配方', resultCount: 20, durationMs: 1, source: 'mention' } }),
    } as unknown as LocalKnowledgeService
    const complete = vi.fn().mockResolvedValue({ text: '查询完成。', toolCalls: [] })

    const result = await runPalAgent({
      question: '',
      history: [],
      profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'retrieval-only' },
      knowledge,
      mentions: [tool('find_children_for_parent'), lamballMention],
      complete,
    })

    expect(result.evidence).toHaveLength(20)
    expect(result.evidence[0]).toEqual(referencedPal)
  })

  it('returns valid structured JSON for a large model-requested tool result', async () => {
    const baseEvidence: KnowledgeEvidence = { id: 'pal:SheepBall', kind: 'pal', title: '棉悠悠', summary: '本地记录', matchedFields: ['identity'], score: 10, datasetVersion: 'v1' }
    const largeProfiles = Array.from({ length: 4 }, (_, index) => ({
      id: `Pal${index + 1}`,
      paldexNo: `${index + 1}`,
      name: { zhHans: `测试帕鲁${index + 1}`, en: `Test ${index + 1}` },
      elements: ['neutral'],
      rarity: 1,
      workSuitabilities: { 手工作业: 1 },
      stats: { hp: 70 + index, attack: 80, defense: 60 },
      activeSkills: Array.from({ length: 30 }, () => ({ skillId: 'Large', detail: { description: '技能详情'.repeat(500) } })),
    }))
    const knowledge = {
      evidenceForEntity: vi.fn(),
      preRetrieve: vi.fn().mockReturnValue([baseEvidence]),
      execute: vi.fn().mockResolvedValue({ content: largeProfiles, evidence: [baseEvidence], trace: { tool: 'compare_pals', label: '比较', resultCount: 4, durationMs: 1, source: 'model' } }),
    } as unknown as LocalKnowledgeService
    const complete = vi.fn()
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'compare', name: 'compare_pals', arguments: { pals: ['Pal1', 'Pal2', 'Pal3', 'Pal4'] } }] })
      .mockResolvedValueOnce({ text: '比较完成。', toolCalls: [] })

    await runPalAgent({ question: '比较棉悠悠', history: [], profile: { ...createProviderProfile('openai'), model: 'm', capabilityMode: 'tools' }, knowledge, complete })

    const toolMessage = complete.mock.calls[1][0].messages.find((message: { role: string }) => message.role === 'tool') as { content: string }
    const parsed = JSON.parse(toolMessage.content) as Array<{ id: string; stats: { hp: number } }>
    expect(parsed.map((entry) => entry.id)).toEqual(['Pal1', 'Pal2', 'Pal3', 'Pal4'])
    expect(parsed.map((entry) => entry.stats.hp)).toEqual([70, 71, 72, 73])
  })
})
