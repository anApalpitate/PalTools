import type { BreedingPlanValidationResult } from '../src/domain/breeding-graph'
import type { BreedingRecipe, PalRecord } from '../src/domain/types'

export interface PalRef {
  internalId: string
  paldbId: string
  paldexNo: string | null
  zhName: string
  enName: string
}

export function palRef(pal: PalRecord | undefined): PalRef {
  return {
    internalId: pal?.internalId ?? 'unknown',
    paldbId: pal?.paldbId ?? '',
    paldexNo: pal?.paldexNo ?? null,
    zhName: pal?.name.zhHans ?? '未知帕鲁',
    enName: pal?.name.en ?? '',
  }
}

export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function columnize(rows: string[][]): string {
  if (rows.length === 0) return ''
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column]?.length ?? 0)),
  )
  return rows
    .map((row) =>
      row
        .map((cell, column) => cell.padEnd(widths[column]))
        .join('  ')
        .trimEnd(),
    )
    .join('\n')
}

export function formatPalTable(
  pals: PalRecord[],
  elementNames: ReadonlyMap<string, string>,
): string {
  const rows = pals.map((pal) => [
    pal.paldexNo ?? '无编号',
    pal.name.zhHans,
    pal.name.en,
    pal.internalId,
    pal.elements.map((id) => elementNames.get(id) ?? id).join('/'),
    Object.entries(pal.workSuitabilities)
      .map(([work, level]) => `${work}${level}`)
      .join(',') || '—',
  ])
  return columnize([
    ['编号', '中文名', '英文名', '内部ID', '属性', '工作适性'],
    ...rows,
  ])
}

function palLabel(pal: PalRecord | undefined): string {
  return pal ? `${pal.paldexNo ?? '无编号'} ${pal.name.zhHans}` : '未知帕鲁'
}

export function formatRecipeTable(
  recipes: BreedingRecipe[],
  palsById: ReadonlyMap<string, PalRecord>,
): string {
  const rows = recipes.map((recipe) => [
    palLabel(palsById.get(recipe.parentAId)),
    palLabel(palsById.get(recipe.parentBId)),
    palLabel(palsById.get(recipe.childId)),
  ])
  return columnize([['亲本A', '亲本B', '子代'], ...rows])
}

export function formatPlanIssues(result: BreedingPlanValidationResult): string {
  if (result.valid) {
    return '方案有效\n'
  }
  return [
    '方案无效：',
    ...result.issues.map((issue) => `- ${issue.code}：${issue.message}`),
    '',
  ].join('\n')
}
