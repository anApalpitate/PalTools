import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const entryPoint = resolve(repoRoot, 'src', 'domain', 'provider-protocol.ts')
const outputFile = resolve(repoRoot, 'build', 'electron', 'provider-protocol.cjs')

const result = await build({
  absWorkingDir: repoRoot,
  entryPoints: [entryPoint],
  outfile: outputFile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  metafile: true,
  legalComments: 'none',
  write: false,
})

const normalize = (value) => value.split(sep).join('/')
const entryRelative = normalize(relative(repoRoot, entryPoint))
const runtimeInputs = Object.keys(result.metafile.inputs).map(normalize)
const unexpectedInputs = runtimeInputs.filter((input) => input !== entryRelative)
const output = Object.values(result.metafile.outputs).find((item) => item.entryPoint)

if (unexpectedInputs.length > 0) {
  throw new Error(`Electron Provider 协议产物包含运行时依赖：${unexpectedInputs.join(', ')}`)
}
if (!output || output.imports.length > 0) {
  throw new Error(`Electron Provider 协议产物包含平台或外部导入：${output?.imports.map((item) => item.path).join(', ') ?? 'unknown output'}`)
}
if (runtimeInputs.some((input) => /(^|\/)node_modules\/|electron|node:(fs|path|net|http|https|tls|child_process)/i.test(input))) {
  throw new Error('Electron Provider 协议产物不能依赖 node_modules、Electron 或平台 I/O')
}

const bundledOutput = result.outputFiles.find((file) => resolve(file.path) === outputFile)
if (!bundledOutput) {
  throw new Error('Electron Provider 协议构建未生成预期的 CommonJS 产物')
}

await mkdir(dirname(outputFile), { recursive: true })
await writeFile(outputFile, bundledOutput.contents)

console.log(`Built ${normalize(relative(repoRoot, outputFile))} from dependency-free protocol source.`)
