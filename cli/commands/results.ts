import type { PalRecord } from '../../src/domain/types'
import { formatJson, formatRecipeTable, palRef } from '../output'
import { errorResult, type CliResult } from '../types'

export function identityError(
  reason: 'no-match' | 'ambiguous' | undefined,
  raw: string,
  candidates: Array<{ name: { zhHans: string }; paldexNo: string | null }>,
  json: boolean,
): CliResult {
  if (reason === 'ambiguous') {
    const names = candidates
      .slice(0, 10)
      .map((pal) => `${pal.paldexNo ?? '无编号'} ${pal.name.zhHans}`)
      .join('、')
    return errorResult(2, 'usage', `“${raw}”匹配到多个帕鲁：${names}`, json)
  }
  return errorResult(2, 'usage', `找不到帕鲁“${raw}”。`, json)
}

export function recipeResult(
  recipes: Array<{ parentAId: string; parentBId: string; childId: string }>,
  datasetVersion: string,
  palsById: ReadonlyMap<string, PalRecord>,
  json: boolean,
): CliResult {
  const formatted = recipes.map((recipe) => ({
    parentA: palRef(palsById.get(recipe.parentAId)),
    parentB: palRef(palsById.get(recipe.parentBId)),
    child: palRef(palsById.get(recipe.childId)),
  }))
  if (json) {
    return {
      exitCode: 0,
      stdout: formatJson({
        datasetVersion,
        count: recipes.length,
        recipes: formatted,
      }),
      stderr: '',
    }
  }
  return {
    exitCode: 0,
    stdout:
      formatRecipeTable(recipes, palsById) +
      `\n共 ${recipes.length} 条配方\n`,
    stderr: '',
  }
}