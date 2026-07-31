import { filterPals, type PalFilters } from '../../src/domain/pals'
import type { CliCommand } from '../args'
import { formatJson, formatPalTable } from '../output'
import { errorResult, type CliCommandHandler } from '../types'

export const searchCommand: CliCommandHandler<
  Extract<CliCommand, { kind: 'search' }>
> = {
  kind: 'search',
  run(command, { dataset }) {
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
  },
}