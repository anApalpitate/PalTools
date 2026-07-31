import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const packageMetadata = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
)

if (
  typeof packageMetadata.version !== 'string' ||
  packageMetadata.version.trim() === ''
) {
  throw new Error('package.json version must be a non-empty string')
}

await build({
  entryPoints: ['cli/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: 'build/cli/paltools.mjs',
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __PALTOOLS_VERSION__: JSON.stringify(packageMetadata.version.trim()),
  },
})
