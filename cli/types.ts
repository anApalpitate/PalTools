import type { CliCommand } from './args'
import type { CliDataset } from './data-loader'
import type { PalRecord } from '../src/domain/types'
import { formatJson } from './output'

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

export interface CliCommandContext {
  deps: CliDeps
  dataset: CliDataset
  palsById: ReadonlyMap<string, PalRecord>
}

export interface CliCommandHandler<TCommand extends CliCommand = CliCommand> {
  kind: TCommand['kind']
  run(command: TCommand, context: CliCommandContext): CliResult
}

export function errorResult(
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