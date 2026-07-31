import { readFileSync } from 'node:fs'
import { runCli } from './run'
import { loadDataset } from './data-loader'
import { CLI_APP_VERSION } from './version'

const result = runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  appVersion: CLI_APP_VERSION,
  loadDataset,
  readFile: (filePath) => readFileSync(filePath, 'utf8'),
  env: process.env,
})

process.stdout.write(result.stdout)
process.stderr.write(result.stderr)
process.exit(result.exitCode)
