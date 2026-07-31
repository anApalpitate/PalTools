import { HELP_TEXT, parseArgs } from './args'
import { COMMAND_HANDLERS } from './commands/registry'
import { DataUnavailableError, resolveDataDir, type CliDataset } from './data-loader'
import { errorResult, type CliDeps, type CliResult } from './types'

export type { CliDeps, CliResult } from './types'

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
  const handler = COMMAND_HANDLERS.get(command.kind)
  if (!handler) {
    throw new Error(`Unknown command handler: ${command.kind}`)
  }
  return handler.run(command, { deps, dataset, palsById })
}