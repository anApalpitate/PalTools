import { z } from 'zod'
import type { JsonValue } from './agent'

export const knowledgeKindSchema = z.enum(['pal', 'skill', 'passive', 'item', 'recipe'])
export type KnowledgeKind = z.infer<typeof knowledgeKindSchema>

export const knowledgeEvidenceSchema = z.object({
  id: z.string(),
  kind: knowledgeKindSchema,
  title: z.string(),
  summary: z.string(),
  matchedFields: z.array(z.string()),
  score: z.number(),
  route: z.string().optional(),
  imagePath: z.string().optional(),
  datasetVersion: z.string(),
})
export type KnowledgeEvidence = z.infer<typeof knowledgeEvidenceSchema>

export const localToolNameSchema = z.enum([
  'search_local_knowledge',
  'get_pal_profile',
  'compare_pals',
  'find_child_by_parents',
  'find_children_for_parent',
  'find_parents_for_child',
  'find_drop_sources',
  'find_skill_owners',
])
export type LocalToolName = z.infer<typeof localToolNameSchema>

export const localToolTraceSourceSchema = z.enum(['pre-retrieval', 'intent', 'mention', 'model'])
export type LocalToolTraceSource = z.infer<typeof localToolTraceSourceSchema>

export const localToolTraceSchema = z.object({
  tool: localToolNameSchema,
  label: z.string(),
  resultCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  source: localToolTraceSourceSchema.optional(),
})
export type LocalToolTrace = z.infer<typeof localToolTraceSchema>

export interface LocalToolResult {
  content: unknown
  evidence: KnowledgeEvidence[]
  trace: LocalToolTrace
}

export const localToolResultSchema: z.ZodType<LocalToolResult> = z.object({
  content: z.unknown(),
  evidence: z.array(knowledgeEvidenceSchema),
  trace: localToolTraceSchema,
})

export interface AssistantToolMentionV1 {
  kind: 'tool'
  name: LocalToolName
  label: string
  arguments: Record<string, JsonValue>
}

export interface AssistantEntityMentionV1 {
  kind: 'entity'
  entityType: 'pal' | 'skill' | 'item'
  id: string
  label: string
}

export type AssistantMentionV1 = AssistantToolMentionV1 | AssistantEntityMentionV1

const mentionJsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(),
  z.array(mentionJsonValueSchema), z.record(z.string(), mentionJsonValueSchema),
]))

export const assistantMentionSchema: z.ZodType<AssistantMentionV1> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('tool'),
    name: localToolNameSchema,
    label: z.string().trim().min(1).max(80),
    arguments: z.record(z.string(), mentionJsonValueSchema),
  }).strict(),
  z.object({
    kind: z.literal('entity'),
    entityType: z.enum(['pal', 'skill', 'item']),
    id: z.string().trim().min(1).max(200),
    label: z.string().trim().min(1).max(80),
  }).strict(),
])

export const assistantMentionsSchema = z.array(assistantMentionSchema).max(12).transform((mentions, context) => {
  const unique = [...new Map(mentions.map((mention) => [mention.kind === 'tool' ? `tool:${mention.name}` : `entity:${mention.entityType}:${mention.id}`, mention])).values()]
  const toolCount = unique.filter((mention) => mention.kind === 'tool').length
  const entityCount = unique.length - toolCount
  if (toolCount > 4) context.addIssue({ code: 'custom', message: '每条消息最多选择 4 个本地工具。' })
  if (entityCount > 8) context.addIssue({ code: 'custom', message: '每条消息最多引用 8 个帕鲁、技能或掉落物。' })
  return unique
})

export interface AgentToolDefinition {
  name: LocalToolName
  description: string
  inputSchema: Record<string, unknown>
}

export const LOCAL_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  { name: 'search_local_knowledge', description: '搜索本地图鉴、技能、固有词条和掉落物。', inputSchema: { type: 'object', properties: { query: { type: 'string' }, kinds: { type: 'array', items: { enum: ['pal', 'skill', 'passive', 'item'] } }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['query'], additionalProperties: false } },
  { name: 'get_pal_profile', description: '按名称、拼音、编号或内部 ID 获取一只帕鲁的完整资料。', inputSchema: { type: 'object', properties: { pal: { type: 'string' } }, required: ['pal'], additionalProperties: false } },
  { name: 'compare_pals', description: '比较 2 到 4 只帕鲁的属性、数值和工作适性。', inputSchema: { type: 'object', properties: { pals: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string' } } }, required: ['pals'], additionalProperties: false } },
  { name: 'find_child_by_parents', description: '根据两只亲本精确查询子代。', inputSchema: { type: 'object', properties: { parentA: { type: 'string' }, parentB: { type: 'string' } }, required: ['parentA', 'parentB'], additionalProperties: false } },
  { name: 'find_children_for_parent', description: '查询指定帕鲁参与的子代配方。', inputSchema: { type: 'object', properties: { parent: { type: 'string' }, query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 50 }, offset: { type: 'integer', minimum: 0 } }, required: ['parent'], additionalProperties: false } },
  { name: 'find_parents_for_child', description: '反查目标子代的亲本组合。', inputSchema: { type: 'object', properties: { child: { type: 'string' }, query: { type: 'string' }, excludeSelf: { type: 'boolean' }, excludeLegendary: { type: 'boolean' }, sort: { enum: ['paldexNo', 'averageRarity'] }, direction: { enum: ['asc', 'desc'] }, limit: { type: 'integer', minimum: 1, maximum: 50 }, offset: { type: 'integer', minimum: 0 } }, required: ['child'], additionalProperties: false } },
  { name: 'find_drop_sources', description: '按物品名称查询会掉落它的帕鲁。', inputSchema: { type: 'object', properties: { item: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['item'], additionalProperties: false } },
  { name: 'find_skill_owners', description: '按主动技能名称查询可学习该技能的帕鲁。', inputSchema: { type: 'object', properties: { skill: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 20 } }, required: ['skill'], additionalProperties: false } },
]

const localToolArgumentSchemas: Record<LocalToolName, z.ZodTypeAny> = {
  search_local_knowledge: z.object({ query: z.string().min(1), kinds: z.array(z.enum(['pal', 'skill', 'passive', 'item'])).optional(), limit: z.number().int().min(1).max(20).default(8) }).strict(),
  get_pal_profile: z.object({ pal: z.string().min(1) }).strict(),
  compare_pals: z.object({ pals: z.array(z.string().min(1)).min(2).max(4) }).strict(),
  find_child_by_parents: z.object({ parentA: z.string().min(1), parentB: z.string().min(1) }).strict(),
  find_children_for_parent: z.object({ parent: z.string().min(1), query: z.string().default(''), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) }).strict(),
  find_parents_for_child: z.object({ child: z.string().min(1), query: z.string().default(''), excludeSelf: z.boolean().default(false), excludeLegendary: z.boolean().default(false), sort: z.enum(['paldexNo', 'averageRarity']).default('paldexNo'), direction: z.enum(['asc', 'desc']).default('asc'), limit: z.number().int().min(1).max(50).default(20), offset: z.number().int().min(0).default(0) }).strict(),
  find_drop_sources: z.object({ item: z.string().min(1), limit: z.number().int().min(1).max(20).default(10) }).strict(),
  find_skill_owners: z.object({ skill: z.string().min(1), limit: z.number().int().min(1).max(20).default(10) }).strict(),
}

export function parseLocalToolArguments(name: LocalToolName, rawArguments: unknown): Record<string, unknown> {
  return localToolArgumentSchemas[name].parse(rawArguments) as Record<string, unknown>
}
