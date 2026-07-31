import {
  filterPals,
  recipesForChild,
  recipesForParents,
  type PalFilters,
} from '../src/domain/pals'
import {
  breedingPlanExportV1Schema,
  validateBreedingPlan,
} from '../src/domain/breeding-graph'
import {
  DataUnavailableError,
  resolveDataDir,
  type CliDataset,
} from './data-loader'
import type { PalRecord } from '../src/domain/types'
import { resolvePalIdentity } from './identity'
import { HELP_TEXT, parseArgs } from './args'
import {
  formatJson,
  formatPalTable,
  formatPlanIssues,
  formatRecipeTable,
  palRef,
} from './output'

export interface CliDeps {
  cwd: string
  appVersion: string
  loadDataset: (dataDir: string) => CliDataset
  readFile: (filePath: string) => string
  env?: Record<string, string | undefined>
}

export interface CliResult {
  exitCode: number
  stdout: string
  stderr: string
}

function errorResult(
  exitCode: number,
  code: string,
  message: string,
  json: boolean,
): CliResult {
  if (json) {
    return {
      exitCode,
      stdout: formatJson({ exitCode, error: { code, message } }),
      stderr: '',
    }
  }
  return { exitCode, stdout: '', stderr: `错误：${message}\n` }
}

export function runCli(argv: string[], deps: CliDeps): CliResult {
  const parsed = parseArgs(argv)
  if (parsed.kind === 'usage-error') {
    return errorResult(2, 'usage', parsed.message, parsed.json)
  }

  const { command, dataDir } = parsed
  if (command.kind === 'help') {
    return { exitCode: 0, stdout: HELP_TEXT, stderr: '' }
  }
  if (command.kind === 'version') {
    return { exitCode: 0, stdout: `${deps.appVersion}\n`, stderr: '' }
  }

  let dataset: CliDataset
  try {
    dataset = deps.loadDataset(
      resolveDataDir(deps.cwd, dataDir, deps.env),
    )
  } catch (error) {
    if (error instanceof DataUnavailableError) {
      return errorResult(4, error.code, error.message, command.json)
    }
    throw error
  }

  const palsById = new Map(dataset.pals.map((pal) => [pal.internalId, pal]))

  switch (command.kind) {
    case 'info': {
      const manifest = dataset.manifest
      const payload = {
        appVersion: deps.appVersion,
        datasetVersion: manifest.datasetVersion,
        gameReleaseLine: manifest.gameReleaseLine,
        gameBuildId: manifest.gameBuildId,
        recordCounts: manifest.recordCounts,
      }
      return {
        exitCode: 0,
        stdout: command.json
          ? formatJson(payload)
          : [
              `PalTools CLI ${deps.appVersion}`,
              `数据集：${manifest.datasetVersion}`,
              `游戏：${manifest.gameReleaseLine} (build ${manifest.gameBuildId})`,
              `帕鲁 ${manifest.recordCounts.pals} · 配方 ${manifest.recordCounts.recipes}`,
              '',
            ].join('\n'),
        stderr: '',
      }
    }
    case 'search': {
      const filters: PalFilters = {
        query: command.query,
        element: command.element,
        workTypes: command.workTypes,
        sortKey: command.sortKey,
        sortDirection: command.sortDirection,
      }
      const all = filterPals(dataset.pals, filters, {
        skills: dataset.skills,
        items: dataset.items,
      })
      if (all.length === 0) {
        return errorResult(3, 'no-results', '没有匹配的帕鲁。', command.json)
      }
      const pals = all.slice(0, command.limit)
      if (command.json) {
        return {
          exitCode: 0,
          stdout: formatJson({
            datasetVersion: dataset.manifest.datasetVersion,
            count: all.length,
            pals,
          }),
          stderr: '',
        }
      }
      return {
        exitCode: 0,
        stdout:
          formatPalTable(pals, dataset.elementNames) +
          `\n共 ${all.length} 条结果，显示前 ${pals.length} 条\n`,
        stderr: '',
      }
    }
    case 'forward': {
      const parentA = resolvePalIdentity(dataset.pals, command.parentA)
      if (!parentA.ok) {
        return identityError(parentA.reason, command.parentA, parentA.candidates, command.json)
      }
      const parentB = resolvePalIdentity(dataset.pals, command.parentB)
      if (!parentB.ok) {
        return identityError(parentB.reason, command.parentB, parentB.candidates, command.json)
      }
      const recipes = recipesForParents(
        dataset.breedingIndex,
        parentA.pal!.internalId,
        parentB.pal!.internalId,
      )
      if (recipes.length === 0) {
        return errorResult(
          3,
          'no-results',
          '当前组合没有正式配方。',
          command.json,
        )
      }
      return recipeResult(
        recipes,
        dataset.manifest.datasetVersion,
        palsById,
        command.json,
      )
    }
    case 'reverse': {
      const target = resolvePalIdentity(dataset.pals, command.target)
      if (!target.ok) {
        return identityError(target.reason, command.target, target.candidates, command.json)
      }
      const recipes = recipesForChild(
        dataset.breedingIndex,
        target.pal!.internalId,
      )
      if (recipes.length === 0) {
        return errorResult(
          3,
          'no-results',
          '该帕鲁没有可用亲本配方。',
          command.json,
        )
      }
      return recipeResult(
        recipes,
        dataset.manifest.datasetVersion,
        palsById,
        command.json,
      )
    }
    case 'plan-validate': {
      let raw: unknown
      try {
        raw = JSON.parse(deps.readFile(command.file))
      } catch {
        return errorResult(
          2,
          'usage',
          `无法读取方案文件：${command.file}`,
          command.json,
        )
      }
      const exported = breedingPlanExportV1Schema.safeParse(raw)
      if (!exported.success) {
        const issues = [
          {
            code: 'invalid-plan',
            message: exported.error.issues
              .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`)
              .join('; '),
          },
        ]
        return planResult(issues, dataset.manifest.datasetVersion, command.json)
      }
      const validPalIds = new Set(dataset.pals.map((pal) => pal.internalId))
      const result = validateBreedingPlan(
        {
          id: 'imported-plan',
          schemaVersion: 1,
          name: exported.data.plan.name,
          nodes: exported.data.plan.nodes,
          relations: exported.data.plan.relations,
          viewport: exported.data.plan.viewport,
          createdAt: exported.data.exportedAt,
          updatedAt: exported.data.exportedAt,
        },
        {
          validPalIds,
          breedingIndex: dataset.breedingIndex,
        },
      )
      const datasetVersionMismatch =
        exported.data.datasetVersion !== dataset.manifest.datasetVersion
      if (command.json) {
        return {
          exitCode: result.valid ? 0 : 1,
          stdout: formatJson({
            datasetVersion: dataset.manifest.datasetVersion,
            datasetVersionMismatch,
            valid: result.valid,
            issues: result.issues,
          }),
          stderr: '',
        }
      }
      return {
        exitCode: result.valid ? 0 : 1,
        stdout:
          formatPlanIssues(result) +
          (datasetVersionMismatch
            ? '提示：导出文件的数据集版本与当前数据不一致，已按当前索引重新校验。\n'
            : ''),
        stderr: '',
      }
    }
  }
}

function identityError(
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
    return errorResult(
      2,
      'usage',
      `“${raw}”匹配到多个帕鲁：${names}`,
      json,
    )
  }
  return errorResult(2, 'usage', `找不到帕鲁“${raw}”。`, json)
}

function recipeResult(
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
      formatRecipeTable(
        recipes,
        palsById,
      ) + `\n共 ${recipes.length} 条配方\n`,
    stderr: '',
  }
}

function planResult(
  issues: Array<{ code: string; message: string }>,
  datasetVersion: string,
  json: boolean,
): CliResult {
  if (json) {
    return {
      exitCode: 1,
      stdout: formatJson({
        datasetVersion,
        datasetVersionMismatch: false,
        valid: false,
        issues,
      }),
      stderr: '',
    }
  }
  return {
    exitCode: 1,
    stdout:
      '方案无效：\n' +
      issues.map((issue) => `- ${issue.code}：${issue.message}`).join('\n') +
      '\n',
    stderr: '',
  }
}
