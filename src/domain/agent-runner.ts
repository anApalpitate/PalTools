import type { ProviderProfileV1 } from './agent'
import type { AgentModelMessage, AgentModelResult } from './provider-adapters'
import { LOCAL_TOOL_DEFINITIONS, type KnowledgeEvidence, type LocalKnowledgeService, type LocalToolName, type LocalToolTrace } from './knowledge'

export interface AgentRunResult {
  text: string
  evidence: KnowledgeEvidence[]
  traces: LocalToolTrace[]
  usage?: AgentModelResult['usage']
}

const SYSTEM_PROMPT = `你是 PalTools 帕鲁查询助手。你的所有《幻兽帕鲁》游戏事实必须来自本轮提供的本地证据或本地工具结果。不得使用自身记忆补全游戏事实，不得声称访问了网页。若证据不足，请明确说“当前本地数据中没有足够依据”。回答使用简洁中文，先给结论，再给必要依据。配方中的亲本顺序等价。不要输出思维过程。`

export async function runPalAgent(options: {
  question: string
  history: AgentModelMessage[]
  profile: ProviderProfileV1
  knowledge: LocalKnowledgeService
  complete: (request: { messages: AgentModelMessage[]; tools: typeof LOCAL_TOOL_DEFINITIONS; allowTools: boolean }) => Promise<AgentModelResult>
  onStatus?: (status: string) => void
}): Promise<AgentRunResult> {
  const evidence = options.knowledge.preRetrieve(options.question)
  const traces: LocalToolTrace[] = [{ tool: 'search_local_knowledge', label: `预检索“${options.question}”`, resultCount: evidence.length, durationMs: 0 }]
  if (evidence.length === 0) return { text: '当前本地数据中没有足够依据。可以换用帕鲁名称、图鉴编号、技能或掉落物关键词再试一次。', evidence, traces }

  const palNames = evidence.filter((item) => item.kind === 'pal').slice(0, 2).map((item) => item.title)
  const itemName = evidence.find((item) => item.kind === 'item')?.title
  const skillName = evidence.find((item) => item.kind === 'skill')?.title
  const plannedCalls: Array<{ name: LocalToolName; arguments: Record<string, unknown> }> = []
  if (/(怎么配|如何配|亲本|反查)/.test(options.question) && palNames[0]) plannedCalls.push({ name: 'find_parents_for_child', arguments: { child: palNames[0], limit: 12 } })
  else if (/(配出|配种|子代)/.test(options.question) && palNames.length >= 2) plannedCalls.push({ name: 'find_child_by_parents', arguments: { parentA: palNames[0], parentB: palNames[1] } })
  else if (/(比较|对比|区别)/.test(options.question) && palNames.length >= 2) plannedCalls.push({ name: 'compare_pals', arguments: { pals: palNames } })
  if (/(掉落|哪里出|谁会掉)/.test(options.question) && itemName) plannedCalls.push({ name: 'find_drop_sources', arguments: { item: itemName } })
  if (/(技能|谁会|谁能学)/.test(options.question) && skillName) plannedCalls.push({ name: 'find_skill_owners', arguments: { skill: skillName } })
  for (const call of plannedCalls) {
    const result = await options.knowledge.execute(call.name, call.arguments)
    evidence.push(...result.evidence)
    traces.push(result.trace)
  }

  const evidencePacket = evidence.map((item) => ({ id: item.id, kind: item.kind, title: item.title, summary: item.summary })).slice(0, 8)
  const messages: AgentModelMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...options.history,
    { role: 'user', content: `${options.question}\n\n本地预检索证据：\n${JSON.stringify(evidencePacket)}` },
  ]
  const allowTools = options.profile.capabilityMode !== 'retrieval-only'
  let lastUsage: AgentModelResult['usage']
  for (let round = 0; round < 6; round += 1) {
    options.onStatus?.(round === 0 ? '正在整理本地证据' : `正在执行第 ${round} 轮本地查询`)
    const response = await options.complete({ messages, tools: LOCAL_TOOL_DEFINITIONS, allowTools })
    lastUsage = response.usage ?? lastUsage
    if (!response.toolCalls.length) return { text: response.text.trim() || '当前本地数据中没有足够依据。', evidence: uniqueEvidence(evidence), traces, usage: lastUsage }
    messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls })
    for (const call of response.toolCalls) {
      const definition = LOCAL_TOOL_DEFINITIONS.find((tool) => tool.name === call.name)
      if (!definition) {
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify({ error: '未知或未授权的本地工具' }) })
        continue
      }
      try {
        const result = await options.knowledge.execute(call.name as LocalToolName, call.arguments)
        evidence.push(...result.evidence); traces.push(result.trace)
        const serialized = JSON.stringify(result.content)
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: serialized.length > 24000 ? `${serialized.slice(0, 24000)}…` : serialized })
      } catch (error) {
        messages.push({ role: 'tool', name: call.name, toolCallId: call.id, content: JSON.stringify({ error: error instanceof Error ? error.message : '工具参数无效' }) })
      }
    }
  }
  return { text: '本轮查询步骤过多，已在安全上限处停止。请把问题缩小到一只帕鲁或一类配方后重试。', evidence: uniqueEvidence(evidence), traces, usage: lastUsage }
}

function uniqueEvidence(evidence: KnowledgeEvidence[]): KnowledgeEvidence[] {
  return [...new Map(evidence.map((item) => [item.id, item])).values()].slice(0, 20)
}
