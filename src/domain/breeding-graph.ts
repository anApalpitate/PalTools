import { z } from 'zod'
import { decodeRecipe } from './pals'
import type { BreedingIndexPayload } from './types'

const idSchema = z.string().trim().min(1)
const timestampSchema = z.string().datetime({ offset: true })

export const graphPositionV1Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
})

export const graphViewportV1Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().positive(),
})

export const breedingGraphNodeV1Schema = z.object({
  id: idSchema,
  palId: idSchema,
  position: graphPositionV1Schema,
  source: z.enum([
    'preset',
    'manual',
    'recipe-export',
    'manual-child',
    'import',
  ]),
})

export const breedingRelationV1Schema = z.object({
  id: idSchema,
  parentANodeId: idSchema,
  parentBNodeId: idSchema,
  childNodeId: idSchema,
  recipeIndex: z.number().int().nonnegative(),
})

export const palPresetV1Schema = z.object({
  id: idSchema,
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(80),
  palIds: z.array(idSchema),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).superRefine((preset, context) => {
  const seen = new Set<string>()
  preset.palIds.forEach((palId, index) => {
    if (seen.has(palId)) {
      context.addIssue({
        code: 'custom',
        path: ['palIds', index],
        message: `帕鲁 “${palId}” 在预设中重复。`,
      })
    }
    seen.add(palId)
  })
})

export const breedingPlanV1Schema = z.object({
  id: idSchema,
  schemaVersion: z.literal(1),
  name: z.string().trim().min(1).max(80),
  nodes: z.array(breedingGraphNodeV1Schema),
  relations: z.array(breedingRelationV1Schema),
  viewport: graphViewportV1Schema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const planPresetLinkV1Schema = z.object({
  planId: idSchema,
  presetId: idSchema,
  lastUsedAt: timestampSchema,
})

export const breedingPlanExportV1Schema = z.object({
  format: z.literal('paltools-breeding-plan'),
  schemaVersion: z.literal(1),
  datasetVersion: idSchema,
  exportedAt: timestampSchema,
  plan: breedingPlanV1Schema.pick({
    name: true,
    nodes: true,
    relations: true,
    viewport: true,
  }),
})

export type GraphPositionV1 = z.infer<typeof graphPositionV1Schema>
export type GraphViewportV1 = z.infer<typeof graphViewportV1Schema>
export type BreedingGraphNodeV1 = z.infer<typeof breedingGraphNodeV1Schema>
export type BreedingRelationV1 = z.infer<typeof breedingRelationV1Schema>
export type PalPresetV1 = z.infer<typeof palPresetV1Schema>
export type BreedingPlanV1 = z.infer<typeof breedingPlanV1Schema>
export type PlanPresetLinkV1 = z.infer<typeof planPresetLinkV1Schema>
export type BreedingPlanExportV1 = z.infer<typeof breedingPlanExportV1Schema>

export const breedingGraphNodeV2Schema = z.object({
  id: idSchema,
  palId: idSchema,
  source: z.enum(['manual', 'fork', 'child', 'import', 'paste']),
  forkOf: idSchema.optional(),
})

export const breedingLayerV2Schema = z.object({
  nodeIds: z.array(idSchema),
})

export const breedingPlanV2Schema = z.object({
  id: idSchema,
  schemaVersion: z.literal(2),
  name: z.string().trim().min(1).max(80),
  layers: z.array(breedingLayerV2Schema),
  nodes: z.array(breedingGraphNodeV2Schema),
  relations: z.array(breedingRelationV1Schema),
  viewport: graphViewportV1Schema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

export const breedingPlanExportV2Schema = z.object({
  format: z.literal('paltools-breeding-plan'),
  schemaVersion: z.literal(2),
  datasetVersion: idSchema,
  exportedAt: timestampSchema,
  plan: breedingPlanV2Schema.pick({
    name: true,
    layers: true,
    nodes: true,
    relations: true,
    viewport: true,
  }),
})

export type BreedingGraphNodeV2 = z.infer<typeof breedingGraphNodeV2Schema>
export type BreedingLayerV2 = z.infer<typeof breedingLayerV2Schema>
export type BreedingRelationV2 = z.infer<typeof breedingRelationV1Schema>
export type BreedingPlanV2 = z.infer<typeof breedingPlanV2Schema>
export type BreedingPlanExportV2 = z.infer<typeof breedingPlanExportV2Schema>

export type BreedingPlanIssueCode =
  | 'invalid-plan'
  | 'duplicate-node-id'
  | 'duplicate-relation-id'
  | 'unknown-pal'
  | 'missing-node'
  | 'same-parent-node'
  | 'self-cycle'
  | 'multiple-generating-relations'
  | 'invalid-recipe'
  | 'cycle'
  | 'invalid-layer'
  | 'node-in-multiple-layers'
  | 'non-adjacent-parents'
  | 'invalid-child-layer'
  | 'multiple-descendant-relations'

export interface BreedingPlanIssue {
  code: BreedingPlanIssueCode
  message: string
  nodeId?: string
  relationId?: string
}

export interface BreedingPlanValidationOptions {
  validPalIds?: ReadonlySet<string>
  breedingIndex?: BreedingIndexPayload
}

export interface BreedingPlanValidationResult {
  valid: boolean
  issues: BreedingPlanIssue[]
  plan: BreedingPlanV1 | null
}

export interface BreedingPlanV2ValidationResult {
  valid: boolean
  issues: BreedingPlanIssue[]
  plan: BreedingPlanV2 | null
}

export function validateBreedingPlanV2(
  input: unknown,
  options: BreedingPlanValidationOptions = {},
): BreedingPlanV2ValidationResult {
  const parsed = breedingPlanV2Schema.safeParse(input)
  if (!parsed.success) {
    return {
      valid: false,
      issues: [
        {
          code: 'invalid-plan',
          message: parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`)
            .join('; '),
        },
      ],
      plan: null,
    }
  }

  const plan = parsed.data
  const issues: BreedingPlanIssue[] = []
  const nodeById = new Map<string, BreedingGraphNodeV2>()
  const layerByNodeId = new Map<string, number>()
  const indexByNodeId = new Map<string, number>()
  const relationIds = new Set<string>()
  const generatingRelationByChild = new Map<string, string>()
  const descendantsByNodeId = new Map<string, number>()
  const adjacency = new Map<string, Set<string>>()

  for (const [row, layer] of plan.layers.entries()) {
    if (layer.nodeIds.length === 0) {
      issues.push({
        code: 'invalid-layer',
        message: `第 ${row} 行不能为空。`,
      })
    }
    for (const [index, nodeId] of layer.nodeIds.entries()) {
      if (layerByNodeId.has(nodeId)) {
        issues.push({
          code: 'node-in-multiple-layers',
          nodeId,
          message: `节点 “${nodeId}” 在多个行槽位中出现。`,
        })
      }
      layerByNodeId.set(nodeId, row)
      indexByNodeId.set(nodeId, index)
    }
  }

  for (const node of plan.nodes) {
    if (nodeById.has(node.id)) {
      issues.push({
        code: 'duplicate-node-id',
        nodeId: node.id,
        message: `节点 ID “${node.id}” 重复。`,
      })
      continue
    }
    nodeById.set(node.id, node)
    adjacency.set(node.id, new Set())
    if (!layerByNodeId.has(node.id)) {
      issues.push({
        code: 'invalid-layer',
        nodeId: node.id,
        message: `节点 “${node.id}” 没有对应的行槽位。`,
      })
    }
    if (options.validPalIds && !options.validPalIds.has(node.palId)) {
      issues.push({
        code: 'unknown-pal',
        nodeId: node.id,
        message: `节点 “${node.id}” 引用了不存在的帕鲁 “${node.palId}”。`,
      })
    }
    if (node.forkOf && !nodeById.has(node.forkOf)) {
      // The referenced source can appear later; this is checked after the node pass.
    }
  }

  for (const nodeId of layerByNodeId.keys()) {
    if (!nodeById.has(nodeId)) {
      issues.push({
        code: 'missing-node',
        nodeId,
        message: `行槽位引用的节点 “${nodeId}” 不存在。`,
      })
    }
  }

  for (const node of nodeById.values()) {
    if (node.forkOf && !nodeById.has(node.forkOf)) {
      issues.push({
        code: 'missing-node',
        nodeId: node.id,
        message: `fork 节点 “${node.id}” 的来源节点 “${node.forkOf}” 不存在。`,
      })
    }
  }

  for (const relation of plan.relations) {
    if (relationIds.has(relation.id)) {
      issues.push({
        code: 'duplicate-relation-id',
        relationId: relation.id,
        message: `关系 ID “${relation.id}” 重复。`,
      })
    }
    relationIds.add(relation.id)
    const parentA = nodeById.get(relation.parentANodeId)
    const parentB = nodeById.get(relation.parentBNodeId)
    const child = nodeById.get(relation.childNodeId)
    for (const [role, nodeId, node] of [
      ['亲本 A', relation.parentANodeId, parentA],
      ['亲本 B', relation.parentBNodeId, parentB],
      ['子代', relation.childNodeId, child],
    ] as const) {
      if (!node) {
        issues.push({
          code: 'missing-node',
          relationId: relation.id,
          message: `关系 “${relation.id}” 的${role}节点 “${nodeId}” 不存在。`,
        })
      }
    }
    if (relation.parentANodeId === relation.parentBNodeId) {
      issues.push({
        code: 'same-parent-node',
        relationId: relation.id,
        message: `关系 “${relation.id}” 必须使用两个不同的亲本节点。`,
      })
    }
    if (
      relation.childNodeId === relation.parentANodeId ||
      relation.childNodeId === relation.parentBNodeId
    ) {
      issues.push({
        code: 'self-cycle',
        relationId: relation.id,
        message: `关系 “${relation.id}” 不能将亲本节点同时作为子代。`,
      })
    }
    const existingRelation = generatingRelationByChild.get(relation.childNodeId)
    if (existingRelation) {
      issues.push({
        code: 'multiple-generating-relations',
        relationId: relation.id,
        nodeId: relation.childNodeId,
        message: `子代节点 “${relation.childNodeId}” 已由关系 “${existingRelation}” 生成。`,
      })
    } else {
      generatingRelationByChild.set(relation.childNodeId, relation.id)
    }
    for (const parentId of [relation.parentANodeId, relation.parentBNodeId]) {
      descendantsByNodeId.set(parentId, (descendantsByNodeId.get(parentId) ?? 0) + 1)
    }
    if (parentA && parentB && child) {
      const parentRow = layerByNodeId.get(parentA.id)
      const otherParentRow = layerByNodeId.get(parentB.id)
      const childRow = layerByNodeId.get(child.id)
      const parentIndex = indexByNodeId.get(parentA.id)
      const otherParentIndex = indexByNodeId.get(parentB.id)
      if (
        parentRow === undefined ||
        otherParentRow === undefined ||
        parentRow !== otherParentRow ||
        parentIndex === undefined ||
        otherParentIndex === undefined ||
        Math.abs(parentIndex - otherParentIndex) !== 1
      ) {
        issues.push({
          code: 'non-adjacent-parents',
          relationId: relation.id,
          message: `关系 “${relation.id}” 的两个亲本必须处于同一行且相邻。`,
        })
      }
      if (childRow !== undefined && parentRow !== undefined && childRow !== parentRow + 1) {
        issues.push({
          code: 'invalid-child-layer',
          relationId: relation.id,
          message: `关系 “${relation.id}” 的子代必须位于亲本下一行。`,
        })
      }
      const recipe = options.breedingIndex
        ? decodeRecipe(options.breedingIndex, relation.recipeIndex)
        : null
      if (options.breedingIndex) {
        const actualParents = [parentA.palId, parentB.palId].sort()
        const recipeParents = recipe
          ? [recipe.parentAId, recipe.parentBId].sort()
          : []
        if (
          !recipe ||
          recipe.childId !== child.palId ||
          recipeParents[0] !== actualParents[0] ||
          recipeParents[1] !== actualParents[1]
        ) {
          issues.push({
            code: 'invalid-recipe',
            relationId: relation.id,
            message: `关系 “${relation.id}” 与配方索引 ${relation.recipeIndex} 不一致。`,
          })
        }
      }
      adjacency.get(parentA.id)?.add(child.id)
      adjacency.get(parentB.id)?.add(child.id)
    }
  }

  for (const [nodeId, count] of descendantsByNodeId) {
    if (count > 1) {
      issues.push({
        code: 'multiple-descendant-relations',
        nodeId,
        message: `节点 “${nodeId}” 已参与多个下游关系，必须先 fork。`,
      })
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    for (const childId of adjacency.get(nodeId) ?? []) {
      if (visit(childId)) return true
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }
  if ([...nodeById.keys()].some(visit)) {
    issues.push({ code: 'cycle', message: '配种图不能包含有向环。' })
  }

  return { valid: issues.length === 0, issues, plan }
}

export function validateBreedingPlan(
  input: unknown,
  options: BreedingPlanValidationOptions = {},
): BreedingPlanValidationResult {
  const parsed = breedingPlanV1Schema.safeParse(input)
  if (!parsed.success) {
    return {
      valid: false,
      issues: [
        {
          code: 'invalid-plan',
          message: parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`)
            .join('; '),
        },
      ],
      plan: null,
    }
  }

  const plan = parsed.data
  const issues: BreedingPlanIssue[] = []
  const nodeById = new Map<string, BreedingGraphNodeV1>()
  const relationIds = new Set<string>()
  const generatingRelationByChild = new Map<string, string>()
  const adjacency = new Map<string, Set<string>>()

  for (const node of plan.nodes) {
    if (nodeById.has(node.id)) {
      issues.push({
        code: 'duplicate-node-id',
        nodeId: node.id,
        message: `节点 ID “${node.id}” 重复。`,
      })
      continue
    }
    nodeById.set(node.id, node)
    adjacency.set(node.id, new Set())
    if (options.validPalIds && !options.validPalIds.has(node.palId)) {
      issues.push({
        code: 'unknown-pal',
        nodeId: node.id,
        message: `节点 “${node.id}” 引用了不存在的帕鲁 “${node.palId}”。`,
      })
    }
  }

  for (const relation of plan.relations) {
    if (relationIds.has(relation.id)) {
      issues.push({
        code: 'duplicate-relation-id',
        relationId: relation.id,
        message: `关系 ID “${relation.id}” 重复。`,
      })
    }
    relationIds.add(relation.id)

    const parentA = nodeById.get(relation.parentANodeId)
    const parentB = nodeById.get(relation.parentBNodeId)
    const child = nodeById.get(relation.childNodeId)
    for (const [role, nodeId, node] of [
      ['亲本 A', relation.parentANodeId, parentA],
      ['亲本 B', relation.parentBNodeId, parentB],
      ['子代', relation.childNodeId, child],
    ] as const) {
      if (!node) {
        issues.push({
          code: 'missing-node',
          relationId: relation.id,
          message: `关系 “${relation.id}” 的${role}节点 “${nodeId}” 不存在。`,
        })
      }
    }

    if (relation.parentANodeId === relation.parentBNodeId) {
      issues.push({
        code: 'same-parent-node',
        relationId: relation.id,
        message: `关系 “${relation.id}” 必须使用两个不同的亲本节点。`,
      })
    }
    if (
      relation.childNodeId === relation.parentANodeId ||
      relation.childNodeId === relation.parentBNodeId
    ) {
      issues.push({
        code: 'self-cycle',
        relationId: relation.id,
        message: `关系 “${relation.id}” 不能将亲本节点同时作为子代。`,
      })
    }

    const existingRelation = generatingRelationByChild.get(relation.childNodeId)
    if (existingRelation) {
      issues.push({
        code: 'multiple-generating-relations',
        relationId: relation.id,
        nodeId: relation.childNodeId,
        message: `子代节点 “${relation.childNodeId}” 已由关系 “${existingRelation}” 生成。`,
      })
    } else {
      generatingRelationByChild.set(relation.childNodeId, relation.id)
    }

    if (parentA && child) adjacency.get(parentA.id)?.add(child.id)
    if (parentB && child) adjacency.get(parentB.id)?.add(child.id)

    if (options.breedingIndex && parentA && parentB && child) {
      const recipe = decodeRecipe(options.breedingIndex, relation.recipeIndex)
      const actualParents = [parentA.palId, parentB.palId].sort()
      const recipeParents = recipe
        ? [recipe.parentAId, recipe.parentBId].sort()
        : []
      if (
        !recipe ||
        recipe.childId !== child.palId ||
        recipeParents[0] !== actualParents[0] ||
        recipeParents[1] !== actualParents[1]
      ) {
        issues.push({
          code: 'invalid-recipe',
          relationId: relation.id,
          message: `关系 “${relation.id}” 与配方索引 ${relation.recipeIndex} 不一致。`,
        })
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visiting.add(nodeId)
    for (const childId of adjacency.get(nodeId) ?? []) {
      if (visit(childId)) return true
    }
    visiting.delete(nodeId)
    visited.add(nodeId)
    return false
  }
  if ([...nodeById.keys()].some(visit)) {
    issues.push({
      code: 'cycle',
      message: '配种图必须保持为有向无环图。',
    })
  }

  return {
    valid: issues.length === 0,
    issues,
    plan,
  }
}

export function nextAvailableName(
  baseName: string,
  existingNames: ReadonlySet<string>,
): string {
  if (!existingNames.has(baseName)) return baseName
  let suffix = 2
  while (existingNames.has(`${baseName}（${suffix}）`)) suffix += 1
  return `${baseName}（${suffix}）`
}
export function parseLegacyOwnedPalIds(
  raw: string | null,
  validPalIds: ReadonlySet<string>,
): string[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as {
      schemaVersion?: unknown
      palIds?: unknown
    }
    if (value.schemaVersion !== 1 || !Array.isArray(value.palIds)) return []
    return [
      ...new Set(
        value.palIds.filter(
          (palId): palId is string =>
            typeof palId === 'string' && validPalIds.has(palId),
        ),
      ),
    ].sort()
  } catch {
    return []
  }
}
