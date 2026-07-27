import { resolve } from 'node:path'
import { downloadArtifact } from '@electron/get'

const [version, cacheRoot, tempDirectory] = process.argv.slice(2)
if (!version || !cacheRoot || !tempDirectory) {
  throw new Error(
    'Usage: prepare-electron-download.mjs <version> <cache-root> <temp-dir>',
  )
}

const zipPath = await downloadArtifact({
  version,
  artifactName: 'electron',
  platform: 'win32',
  arch: 'x64',
  cacheRoot: resolve(cacheRoot),
  tempDirectory: resolve(tempDirectory),
})

process.stdout.write(`${zipPath}\n`)
