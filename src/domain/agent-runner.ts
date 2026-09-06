import { ZodError } from 'zod'
import type { JsonValue, ProviderProfileV1 } from './agent'
import type { AgentModelMessage, AgentModelResult } from './provider-adapters'
import type { LocalKnowledgeService } from './knowledge'
import {
  LOCAL_TOOL_DEFINITIONS,
  assistantMentionsSchema,
  parseLocalToolArguments,
  type AssistantEntityMentionV1,
  type AssistantMentionV1,
  type AssistantToolMentionV1,
  type KnowledgeEvidence,
  type LocalToolName,
  type LocalToolTrace,
  type LocalToolTraceSource,
} from './knowledge-contract'

export interface AgentRunResult {
  text: string
  evidence: KnowledgeEvidence[]
  traces: LocalToolTrace[]
  usage?: AgentModelResult['usage']
}

export interface BoundAssistantToolCall {
  name: LocalToolName
  label: string
  arguments: Record<string, JsonValue>
}

export interface BoundAssistantMentions {
  mentions: AssistantMentionV1[]
  entities: AssistantEntityMentionV1[]
  calls: BoundAssistantToolCall[]
}

interface ToolResultPacket {
  source: Extract<LocalToolTraceSource, 'mention' | 'intent'>
  tool: LocalToolName
  arguments: Record<string, unknown>
  content: unknown
}

export class AssistantMentionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AssistantMentionError'
  }
}

const SYSTEM_PROMPT = `你是 PalTools 帕鲁查询助手。你的所有《幻兽帕鲁》游戏事实必须来自本轮提供的本地证据或本地工具结果。不得使用自身记忆补全游戏事实，不得声称访问了网页。若证据不足，请明确说“当前本地数据中没有足够依据”。回答使用简洁中文，先给结论，再给必要依据。配方中的亲本顺序等价。不要输出思维过程。`
const MAX_MODEL_TOOL_CALLS = 8
const MAX_PREEXEC_CONTENT_CHARS = 12_000

const TOOL_ARGUMENT_GUIDANCE: Record<LocalToolName, string> = {
  search_local_knowledge: '请输入问题正文，或至少引用一个帕鲁、主动技能或掉落物。',
  get_pal_profile: '请引用 1 只帕鲁。',
  compare_pals: '请引用 2–4 只帕鲁。',
  find_child_by_parents: '请引用 2 只亲本帕鲁；如需同种双亲，请在输入区显式确认。',
  find_children_for_parent: '请引用 1 只亲本帕鲁。',
  find_parents_for_child: '请引用 1 只目标帕鲁。',
  find_drop_sources: '请引用 1 个掉落物。',
  find_skill_owners: '请引用 1 个主动技能。',
}

const COMPARE_PALS_PATTERN = /(比较|对比|区别)/
const EXPLICIT_REVERSE_PATTERN = /(目标反查|反查|目标.*亲本|由谁.*(?:配出|配种得到))/
const PARENT_PAIR_PATTERN = /(双亲|亲本|怎么配|如何配|配出|配种|子代|后代|(?:能|可|可以)配(?:出)?(?:什么|哪些))/

export function bindAssistantToolMentions(question: string, input: AssistantMentionV1[] = []): BoundAssistantMentions {
  let mentions: AssistantMentionV1[]
  try {
    mentions = assistantMentionsSchema.parse(input)
  } catch (error) {
    throw new AssistantMentionError(`无法使用 @ 引用：${firstZodMessage(error)}`, { cause: error })
  }

  const entities = mentions.filter((mention): mention is AssistantEntityMentionV1 => mention.kind === 'entity')
  const tools = mentions.filter((mention): mention is AssistantToolMentionV1 => mention.kind === 'tool')
  const palIds = entities.filter((mention) => mention.entityType === 'pal').map((mention) => mention.id)
  const itemIds = entities.filter((mention) => mention.entityType === 'item').map((mention) => mention.id)
  const skillIds = entities.filter((mention) => mention.entityType === 'skill').map((mention) => mention.id)
  const entityQuery = entities.map((mention) => mention.label).join(' ')

  if (
    tools.length === 0
    && palIds.length > 2
    && !COMPARE_PALS_PATTERN.test(question)
    && PARENT_PAIR_PATTERN.test(question)
    && !EXPLICIT_REVERSE_PATTERN.test(question)
  ) {
    throw new AssistantMentionError('双亲查询只能使用 2 只帕鲁，请移除多余引用后再试。')
  }

  const calls = tools.map((mention) => {
    const rawArguments: Record<string, unknown> = { ...mention.arguments }
    if (mention.name === 'search_local_knowledge' && rawArguments.query === undefined) rawArguments.query = question.trim() || entityQuery
    if (mention.name === 'get_pal_profile' && rawArguments.pal === undefined) rawArguments.pal = palIds[0]
    if (mention.name === 'compare_pals' && rawArguments.pals === undefined) rawArguments.pals = palIds
    if (mention.name === 'find_child_by_parents') {
      const hasNoExplicitParent = rawArguments.parentA === undefined && rawArguments.parentB === undefined
      if (hasNoExplicitParent && palIds.length > 2) {
        throw new AssistantMentionError(`无法执行「${mention.label}」：双亲查询只能引用 2 只亲本，请移除多余帕鲁。`)
      }
      fillSequentialArguments(rawArguments, ['parentA', 'parentB'], palIds)
    }
    if (mention.name === 'find_children_for_parent' && rawArguments.parent === undefined) rawArguments.parent = palIds[0]
    if (mention.name === 'find_parents_for_child' && rawArguments.child === undefined) rawArguments.child = palIds[0]
    if (mention.name === 'find_drop_sources' && rawArguments.item === undefined) rawArguments.item = itemIds[0]
    if (mention.name === 'find_skill_owners' && rawArguments.skill === undefined) rawArguments.skill = skillIds[0]

    try {
      return {
        name: mention.name,
        label: mention.label,
        arguments: parseLocalToolArguments(mention.name, rawArguments) as Record<string, JsonValue>,
      }
    } catch (error) {
      const detail = error instanceof ZodError && error.issues[0]?.path.length
        ? `（参数 ${error.issues[0].path.join('.')} 无效）`
        : ''
      throw new AssistantMentionError(`无法执行「${mention.label}」：${TOOL_ARGUMENT_GUIDANCE[mention.name]}${detail}`, { cause: error })
    }
  })

  let callIndex = 0
  const boundMentions = mentions.map((mention): AssistantMentionV1 => mention.kind === 'tool'
    ? { ...mention, arguments: calls[callIndex++].arguments }
    : mention)
  return { mentions: boundMentions, entities, calls }
}

export async function runPalAgent(options: {
  question: string
  history: AgentModelMessage[]
  profile: ProviderProfileV1
  knowledge: LocalKnowledgeService
  mentions?: AssistantMentionV1[]
  signal?: AbortSignal
  complete: (request: { messages: AgentModelMessage[]; tools: typeof LOCAL_TOOL_DEFINITIONS; allowTools: boolean }) => Promise<AgentModelResult>
  onStatus?: (status: string) => void
}): Promise<AgentRunResult> {
  throwIfAborted(options.signal)
  const bound = bindAssistantToolMentions(options.question, options.mentions)
  const exactEntityEvidence = bound.entities.map((mention) => {
    const evidence = options.knowledge.evidenceForEntity(mention.entityType, mention.id)
    if (!evidence) throw new AssistantMentionError(`无法使用引用「${mention.label}」：当前本地数据中不存在这个${entityKindLabel(mention.entityType)}。`)
    return evidence
  })
  const evidence: KnowledgeEvidence[] = [...exactEntityEvidence]
  const traces: LocalToolTrace[] = []
  const toolResults: ToolResultPacket[] = []

  for (const call of bound.calls) {
    throwIfAborted(options.signal)
    options.onStatus?.(`正在执行用户指定的「${call.label}」`)
    const result = await options.knowledge.execute(call.name, call.arguments, 'mention')
    evidence.push(...result.evidence)
    traces.push(result.trace)
    toolResults.push({ source: 'mention', tool: call.name, arguments: call.arguments, content: result.content })
  }

  throwIfAborted(options.signal)
  const retrievalQuery = [options.question.trim(), ...bound.entities.flatMap((mention) => [mention.label, mention.id])].filter(Boolean).join(' ')
  const retrieved = options.knowledge.preRetrieve(retrievalQuery)
  evidence.push(...retrieved)
  traces.push({
    tool: 'search_local_knowledge',
    label: retrievalQuery ? `预检索“${truncate(retrievalQuery, 60)}”` : '预检索空问题',
    resultCount: retrieved.length,
    durationMs: 0,
    source: 'pre-retrieval',
  })

  if (bound.calls.length === 0) {
    const intentCalls = planIntentCalls(options.question, uniqueEvidence(evidence), bound.entities)
    const plannedCalls = intentCalls.length > 0
      ? intentCalls.map((call) => ({ ...call, source: 'intent' as const }))
      : planMentionDefaultCalls(bound.entities).map((call) => ({ ...call, source: 'mention' as const }))
    for (const call of plannedCalls) {
      throwIfAborted(options.signal)
      const result = await options.knowledge.execute(call.name, call.arguments, call.source)
      evidence.push(...result.evidence)
      traces.push(result.trace)
      toolResults.push({ source: call.source, tool: call.name, arguments: call.arguments, content: result.content })
    }
  }

  const finalEvidence = uniqueEvidence(evidence)
  if (finalEvidence.length === 0 && toolResults.length === 0) {
    return {
      text: '当前本地数据中没有足够依据。可以换用帕鲁名称、图鉴编号、技能或掉落物关键词再试一次。',
      evidence: finalEvidence,
      traces: uniqueTraces(traces),
    }
  }

  const evidencePacket = finalEvidence.slice(0, 12).map((item) => ({ id: item.id, kind: item.kind, title: item.title, summary: item.summary }))
  const question = options.question.trim() || '请根据用户指定的本地工具和实体引用整理查询结果。'
  const messages: AgentModelMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...options.history,
    { role: 'user', content: `${question}\n\n本地证据摘要：\n${JSON.stringify(evidencePacket)}\n\n预执行的本地工具结果：\n${serializeToolResults(toolResults)}` },
  ]
  const allowTools = options.profile.capabilityMode !== 'retrieval-only'
  let lastUsage: AgentModelResult['usage']
  let modelToolCallCount = 0
  for (let round = 0; round < 6; round += 1) {
    throwIfAborted(options.signal)
    options.onStatus?.(round === 0 ? '正在整理本地证据' : `正在执行第 ${round} 轮本地查询`)
    const response = await options.complete({ messages, tools: LOCAL_TOOL_DEFINITIONS, allowTools })
    throwIfAborted(options.signal)
    lastUsage = response.usage ?? lastUsage
    if (!allowTools && response.toolCalls.length > 0) {
      return {
        text: response.text.trim() || '当前模型配置为仅检索模式，已忽略模型返回的工具调用。',
        evidence: uniqueEvidence(evidence),
        traces: uniqueTraces(traces),
        usage: lastUsage,
      }
    }
    if (!response.toolCalls.length) {
      return { text: response.text.trim() || '当前本地数据中没有足够依据。', evidence: uniqueEvidence(evidence), traces: uniqueTraces(traces), usage: lastUsage }
    }
    if (response.toolCalls.length > MAX_MODEL_TOOL_CALLS - modelToolCallCount) {
      return {
        text: `模型请求的本地工具调用超过 ${MAX_MODEL_TOOL_CALLS} 次安全上限，已停止本轮查询。请缩小问题范围后重试。`,
        evidence: uniqueEvidence(evidence),
        traces: uniqueTraces(traces),
        usage: lastUsage,
      }
    }
    modelToolCallCount += response.toolCalls.length
    messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls })
    for (const call of response.toolCalls) {
      throwIfAborted(options.signal)
      const definition = LOCAL_TOOL_DEFINITIONS.find((tool) => tool.name === call.name)
      if (!definition) {
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify({ error: '未知或未授权的本地工具' }) })
        continue
      }
      try {
        const result = await options.knowledge.execute(call.name as LocalToolName, call.arguments, 'model')
        evidence.push(...result.evidence)
        traces.push(result.trace)
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify(structuredToolContent(call.name as LocalToolName, result.content)) })
      } catch (error) {
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify({ error: error instanceof Error ? error.message : '工具参数无效' }) })
      }
    }
  }
  return {
    text: '本轮查询步骤过多，已在安全上限处停止。请把问题缩小到一只帕鲁或一类配方后重试。',
    evidence: uniqueEvidence(evidence),
    traces: uniqueTraces(traces),
    usage: lastUsage,
  }
}

function planIntentCalls(question: string, evidence: KnowledgeEvidence[], entities: AssistantEntityMentionV1[]): Array<{ name: LocalToolName; arguments: Record<string, unknown> }> {
  const explicitPalIds = entities.filter((item) => item.entityType === 'pal').map((item) => item.id)
  const palQueries = explicitPalIds.length > 0
    ? explicitPalIds
    : evidence.filter((item) => item.kind === 'pal').slice(0, 2).map((item) => item.title)
  const explicitItemIds = entities.filter((item) => item.entityType === 'item').map((item) => item.id)
  const explicitSkillIds = entities.filter((item) => item.entityType === 'skill').map((item) => item.id)
  const itemQueries = explicitItemIds.length > 0
    ? explicitItemIds
    : evidence.filter((item) => item.kind === 'item').slice(0, 1).map((item) => item.title)
  const skillQueries = explicitSkillIds.length > 0
    ? explicitSkillIds
    : evidence.filter((item) => item.kind === 'skill').slice(0, 1).map((item) => item.title)
  const calls: Array<{ name: LocalToolName; arguments: Record<string, unknown> }> = []
  const comparesPals = COMPARE_PALS_PATTERN.test(question)
  const explicitlyReversesTarget = EXPLICIT_REVERSE_PATTERN.test(question)
  const pairsParents = PARENT_PAIR_PATTERN.test(question)
  const usesSameParent = /(同种|自交|相同亲本|自己\s*(?:和|与|\+|×|x)\s*自己)/i.test(question)
  const listsOneParent = /(单亲|作为亲本|参与.*(?:配方|配种)|(?:全部|所有|哪些).*(?:子代|后代)|(?:子代|后代).*(?:列表|配方)|和谁.*(?:配|繁殖)|(?:能|可|可以)配(?:出)?(?:什么|哪些)|用.*配种)/.test(question)
  const reversesTarget = explicitlyReversesTarget || /(怎么配出|如何配出|怎么配|如何配|亲本)/.test(question)
  const hasExplicitParentPair = explicitPalIds.length === 2 && pairsParents && !explicitlyReversesTarget
  const hasTextParentPair = explicitPalIds.length === 0
    && palQueries.length >= 2
    && /(配出|配种|子代)/.test(question)
    && !/(怎么配|如何配|亲本|反查)/.test(question)

  if (comparesPals && palQueries.length >= 2) {
    calls.push({ name: 'compare_pals', arguments: { pals: palQueries.slice(0, 4) } })
  } else if (usesSameParent && explicitPalIds.length === 1) {
    calls.push({ name: 'find_child_by_parents', arguments: { parentA: explicitPalIds[0], parentB: explicitPalIds[0] } })
  } else if (palQueries.length >= 2 && (hasExplicitParentPair || hasTextParentPair)) {
    calls.push({ name: 'find_child_by_parents', arguments: { parentA: palQueries[0], parentB: palQueries[1] } })
  } else if (listsOneParent && explicitPalIds.length === 1) {
    calls.push({ name: 'find_children_for_parent', arguments: { parent: explicitPalIds[0], limit: 20, offset: 0 } })
  } else if (reversesTarget && palQueries[0]) {
    calls.push({ name: 'find_parents_for_child', arguments: { child: palQueries[0], limit: 12 } })
  }
  if (/(掉落|哪里出|谁会掉)/.test(question)) {
    for (const item of itemQueries) {
      if (calls.length >= 4) break
      calls.push({ name: 'find_drop_sources', arguments: { item } })
    }
  }
  if (/(技能|谁会|谁能学)/.test(question)) {
    for (const skill of skillQueries) {
      if (calls.length >= 4) break
      calls.push({ name: 'find_skill_owners', arguments: { skill } })
    }
  }
  return calls
}

function planMentionDefaultCalls(entities: AssistantEntityMentionV1[]): Array<{ name: LocalToolName; arguments: Record<string, unknown> }> {
  const palIds = entities.filter((entity) => entity.entityType === 'pal').map((entity) => entity.id)
  const palCall = palIds.length === 1
    ? { name: 'get_pal_profile' as const, arguments: { pal: palIds[0] } }
    : palIds.length >= 2 && palIds.length <= 4
      ? { name: 'compare_pals' as const, arguments: { pals: palIds } }
      : null
  const calls: Array<{ name: LocalToolName; arguments: Record<string, unknown> }> = []
  let addedPalCall = false

  for (const entity of entities) {
    if (entity.entityType === 'pal') {
      if (!addedPalCall && palCall) {
        calls.push(palCall)
        addedPalCall = true
      }
    } else if (entity.entityType === 'skill') {
      calls.push({ name: 'find_skill_owners', arguments: { skill: entity.id } })
    } else {
      calls.push({ name: 'find_drop_sources', arguments: { item: entity.id } })
    }
    if (calls.length === 4) break
  }

  return calls
}

function fillSequentialArguments(argumentsRecord: Record<string, unknown>, names: string[], values: string[]): void {
  const used = new Set(names.map((name) => argumentsRecord[name]).filter((value): value is string => typeof value === 'string'))
  const remaining = values.filter((value) => !used.has(value))
  for (const name of names) if (argumentsRecord[name] === undefined) argumentsRecord[name] = remaining.shift()
}

function serializeToolResults(results: ToolResultPacket[]): string {
  if (results.length === 0) return '[]'
  return JSON.stringify(results.map((result) => ({
    source: result.source === 'mention' ? '用户指定' : '自动意图识别',
    tool: result.tool,
    arguments: result.arguments,
    content: structuredToolContent(result.tool, result.content),
  })))
}

function structuredToolContent(tool: LocalToolName, value: unknown): JsonValue {
  const content = toJsonValue(value)
  if (JSON.stringify(content).length <= MAX_PREEXEC_CONTENT_CHARS) return content

  if (tool === 'compare_pals' && Array.isArray(content)) {
    const compactProfiles = content.map(compactPalProfile)
    if (JSON.stringify(compactProfiles).length <= MAX_PREEXEC_CONTENT_CHARS) return compactProfiles
    return content.map(minimalPalProfile)
  }
  if (tool === 'get_pal_profile' && isJsonRecord(content)) {
    const compactProfile = compactPalProfile(content)
    return JSON.stringify(compactProfile).length <= MAX_PREEXEC_CONTENT_CHARS ? compactProfile : minimalPalProfile(content)
  }
  if (isJsonRecord(content) && Array.isArray(content.recipes)) return boundedObjectCollection(content, 'recipes')
  if (Array.isArray(content)) return boundedArrayCollection(content)
  return compactJsonValue(content)
}

function compactPalProfile(value: JsonValue): JsonValue {
  if (!isJsonRecord(value)) return compactJsonValue(value)
  return {
    ...pickJsonFields(value, ['id', 'paldexNo', 'name', 'elements', 'rarity', 'workSuitabilities', 'partnerSkill', 'stats']),
    activeSkills: compactRecordArray(value.activeSkills, ['skillId', 'unlockLevel', 'name', 'detail'], 16),
    passiveSkills: compactRecordArray(value.passiveSkills, ['name', 'description', 'rank'], 16),
    drops: compactRecordArray(value.drops, ['itemId', 'name', 'quantityMin', 'quantityMax', 'probabilityPercent', 'requiredLevel'], 16),
    detailsTruncated: true,
  }
}

function minimalPalProfile(value: JsonValue): JsonValue {
  return isJsonRecord(value)
    ? { ...pickJsonFields(value, ['id', 'paldexNo', 'name', 'elements', 'rarity', 'workSuitabilities', 'stats']), detailsTruncated: true }
    : compactJsonValue(value)
}

function compactRecordArray(value: JsonValue | undefined, keys: string[], limit: number): JsonValue[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, limit).map((entry) => isJsonRecord(entry) ? compactJsonValue(pickJsonFields(entry, keys)) : compactJsonValue(entry))
}

function pickJsonFields(record: Record<string, JsonValue>, keys: string[]): Record<string, JsonValue> {
  const picked: Record<string, JsonValue> = {}
  for (const key of keys) if (record[key] !== undefined) picked[key] = compactJsonValue(record[key])
  return picked
}

function boundedObjectCollection(record: Record<string, JsonValue>, key: string): JsonValue {
  const items = Array.isArray(record[key]) ? record[key] : []
  const base = Object.fromEntries(Object.entries(record).filter(([field]) => field !== key)) as Record<string, JsonValue>
  const kept: JsonValue[] = []
  for (const item of items) {
    const candidate = { ...base, [key]: [...kept, item], returned: kept.length + 1, truncated: kept.length + 1 < items.length }
    if (JSON.stringify(candidate).length > MAX_PREEXEC_CONTENT_CHARS) break
    kept.push(item)
  }
  return { ...base, [key]: kept, returned: kept.length, truncated: kept.length < items.length }
}

function boundedArrayCollection(items: JsonValue[]): JsonValue {
  const kept: JsonValue[] = []
  for (const item of items) {
    const compactItem = compactJsonValue(item)
    const candidate = { items: [...kept, compactItem], returned: kept.length + 1, total: items.length, truncated: kept.length + 1 < items.length }
    if (JSON.stringify(candidate).length > MAX_PREEXEC_CONTENT_CHARS) break
    kept.push(compactItem)
  }
  return { items: kept, returned: kept.length, total: items.length, truncated: kept.length < items.length }
}

function compactJsonValue(value: JsonValue, depth = 0): JsonValue {
  if (typeof value === 'string') return truncate(value, 360)
  if (value === null || typeof value !== 'object') return value
  if (depth >= 4) return Array.isArray(value) ? `[${value.length} 项]` : '[结构已精简]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactJsonValue(item, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, 48).map(([key, item]) => [key, compactJsonValue(item, depth + 1)])) as Record<string, JsonValue>
}

function toJsonValue(value: unknown): JsonValue {
  try { return JSON.parse(JSON.stringify(value ?? null)) as JsonValue }
  catch { return null }
}

function isJsonRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 1))}…` : value
}

function entityKindLabel(kind: AssistantEntityMentionV1['entityType']): string {
  if (kind === 'pal') return '帕鲁'
  if (kind === 'skill') return '主动技能'
  return '掉落物'
}

function firstZodMessage(error: unknown): string {
  return error instanceof ZodError ? error.issues[0]?.message ?? '引用格式无效。' : '引用格式无效。'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw new DOMException('请求已取消。', 'AbortError')
}

function uniqueEvidence(evidence: KnowledgeEvidence[]): KnowledgeEvidence[] {
  return [...new Map(evidence.map((item) => [item.id, item])).values()].slice(0, 20)
}

function uniqueTraces(traces: LocalToolTrace[]): LocalToolTrace[] {
  return [...new Map(traces.map((trace) => [`${trace.source ?? 'legacy'}:${trace.tool}:${trace.label}`, trace])).values()]
}
