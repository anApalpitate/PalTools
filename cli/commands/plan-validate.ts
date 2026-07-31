import {
  breedingPlanExportV1Schema,
  validateBreedingPlan,
} from '../../src/domain/breeding-graph'
import type { CliCommand } from '../args'
import { formatJson, formatPlanIssues } from '../output'
import { errorResult, type CliCommandHandler } from '../types'

export const planValidateCommand: CliCommandHandler<
  Extract<CliCommand, { kind: 'plan-validate' }>
> = {
  kind: 'plan-validate',
  run(command, { deps, dataset }) {
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
  },
}

function planResult(
  issues: Array<{ code: string; message: string }>,
  datasetVersion: string,
  json: boolean,
) {
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