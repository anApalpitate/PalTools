import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { buildDependencyGraph, categories, classifyFile, createTestPlan } from './test-impact.mjs'
import { discoverChanges, executePlan, loadRepository, parseArguments } from './test-changes.mjs'

const fixture = {
  'README.md': '# Test',
  'docs/reference/example.md': '# Example',
  'docs/_meta/wiki-schema.json': '{}',
  'package.json': '{}',
  'src/domain/search.ts': 'export const search = () => 1',
  'src/domain/search.test.ts': "import { search } from './search'",
  'src/domain/isolated.ts': 'export const isolated = 1',
  'src/domain/isolated.test.ts': "import { isolated } from './isolated'",
  'src/domain/types.ts': 'export interface Pal { id: string }',
  'src/domain/runtime-data.test.ts': "import type { Pal } from './types'",
  'src/domain/provider-protocol.ts': 'export const protocol = 1',
  'src/storage/agent-storage.ts': "import type { Pal } from '../domain/types'; export const save = () => 1",
  'src/storage/agent-storage.test.ts': "import { save } from './agent-storage'",
  'src/features/assistant/AssistantPage.tsx': "import { save } from '../../storage/agent-storage'; export const AssistantPage = () => save()",
  'src/features/assistant/AssistantPage.test.tsx': "import { AssistantPage } from './AssistantPage'",
  'src/features/paldex/PaldexPage.tsx': "import { search } from '../../domain/search'; export const PaldexPage = search",
  'src/features/paldex/PaldexPage.test.tsx': "import { PaldexPage } from './PaldexPage'",
  'src/features/breeding/BreedingPage.test.tsx': 'export {}',
  'src/App.tsx': "export * from './features/paldex/PaldexPage'; export * from './features/assistant/AssistantPage'",
  'src/App.test.tsx': "import * as app from './App'",
  'src/styles.css': '@import "./styles/paldex.css";',
  'src/styles/paldex.css': '.paldex { color: red }',
  'src/styles/button-interactions.test.ts': "import { readFileSync } from 'node:fs'; readFileSync(new URL('../styles.css', import.meta.url))",
  'src/hooks/useFocusTrap.ts': 'export function useFocusTrap() {}',
  'src/hooks/overlayHooks.test.tsx': "import { useFocusTrap } from './useFocusTrap'",
  'cli/test-helpers.ts': "import type { Pal } from '../src/domain/types'; export const makePal = () => ({ id: '1' })",
  'cli/identity.ts': "export { search } from '../src/domain/search'",
  'cli/identity.test.ts': "import { search } from './identity'; import { makePal } from './test-helpers'",
  'cli/output.test.ts': "import { makePal } from './test-helpers'",
  'pipeline/data/robots.ts': 'export const allowed = true',
  'pipeline/data/robots.test.ts': "import { allowed } from './robots'",
  'pipeline/data/build.ts': 'export {}',
  'public/data/manifest.json': '{}',
  'script/electron/main.cjs': "require('../../build/electron/provider-protocol.cjs')",
  'script/test-electron-provider-protocol.cjs': "require('../build/electron/provider-protocol.cjs')",
  'script/test-impact.mjs': 'export const select = 1',
  'script/test-impact.node.mjs': "import { select } from './test-impact.mjs'",
  'script/agent-run-log.mjs': 'export const report = 1',
  'script/agent-run-log.node.mjs': "import { report } from './agent-run-log.mjs'",
  'script/lint-docs.mjs': 'export const lint = 1',
  'script/lint-docs.node.mjs': "import { lint } from './lint-docs.mjs'",
}

const plan = (changedFiles, extra = {}) => createTestPlan({ sources: fixture, files: Object.keys(fixture), changedFiles, ...extra })
const testsOf = (value) => value.selectedTests.map(({ file }) => file)
const commandsOf = (value) => value.commands.map(({ id }) => id)

test('classification covers all eight stable categories', () => {
  const examples = ['README.md', 'src/domain/search.ts', 'src/storage/agent-storage.ts', 'src/App.tsx', 'pipeline/data/build.ts', 'cli/identity.ts', 'script/electron/main.cjs', 'script/test-impact.mjs']
  assert.deepEqual(examples.map(classifyFile), categories)
  assert.equal(classifyFile('unexpected/file.xyz'), null)
})

test('documentation selects documentation checks and no executable tests', () => {
  const result = plan(['README.md', 'docs/reference/example.md'], { delivery: true })
  assert.deepEqual(testsOf(result), [])
  assert.deepEqual(commandsOf(result), ['docs:lint', 'diff-check'])
  assert.deepEqual(result.fallbackReasons, [])
  assert.deepEqual(testsOf(plan(['docs/_meta/wiki-schema.json'])), ['script/lint-docs.node.mjs'])
})

test('isolated domain changes do not start jsdom, browser, build or provider checks', () => {
  const result = plan(['src/domain/isolated.ts'])
  assert.deepEqual(testsOf(result), ['src/domain/isolated.test.ts'])
  assert.deepEqual(commandsOf(result), ['vitest', 'diff-check', 'typecheck'])
  assert.equal(result.commands.filter(({ id }) => id === 'vitest').length, 1)
  assert.ok(result.selectedTests[0].reasons[0].includes('isolated.ts -> src/domain/isolated.test.ts'))
})

test('reverse imports select transitive shared consumers and omit unrelated tests', () => {
  const result = plan(['src/domain/search.ts'])
  assert.deepEqual(testsOf(result), ['cli/identity.test.ts', 'src/App.test.tsx', 'src/domain/search.test.ts', 'src/features/paldex/PaldexPage.test.tsx'])
  assert.equal(result.commands.filter(({ id }) => id === 'vitest').length, 1)
  assert.deepEqual(result.fallbackReasons, [])
})

test('type-only shared contracts broaden runtime and desktop delivery coverage', () => {
  const graph = buildDependencyGraph(fixture)
  assert.ok(graph.reverse.get('src/domain/types.ts').has('src/storage/agent-storage.ts'))
  const result = plan(['src/domain/types.ts'], { delivery: true })
  assert.ok(testsOf(result).includes('cli/output.test.ts'))
  assert.ok(testsOf(result).includes('src/features/assistant/AssistantPage.test.tsx'))
  assert.ok(commandsOf(result).includes('test:browser'))
  assert.ok(commandsOf(result).includes('verify:electron'))
  assert.ok(!commandsOf(result).includes('build'))
  assert.ok(!commandsOf(result).includes('typecheck'))
})

test('storage and public hooks include their component consumers', () => {
  const result = plan(['src/storage/agent-storage.ts'])
  assert.deepEqual(testsOf(result), ['src/App.test.tsx', 'src/features/assistant/AssistantPage.test.tsx', 'src/storage/agent-storage.test.ts'])
  assert.deepEqual(testsOf(plan(['src/hooks/useFocusTrap.ts'])), ['src/hooks/overlayHooks.test.tsx'])
})

test('local UI selects its page and App and passes scoped scenes at delivery', () => {
  const result = plan(['src/features/paldex/PaldexPage.tsx'], { delivery: true })
  assert.deepEqual(testsOf(result), ['src/App.test.tsx', 'src/features/paldex/PaldexPage.test.tsx'])
  assert.deepEqual(result.browserScenes, ['paldex'])
  assert.deepEqual(result.commands.find(({ id }) => id === 'test:browser').args, ['run', 'test:browser', '--', '--scenes=paldex'])
  assert.ok(!commandsOf(result).includes('verify:electron'))
})

test('stylesheet readFile consumers and local/global style scenes are explicit', () => {
  const local = plan(['src/styles/paldex.css'], { delivery: true })
  assert.deepEqual(testsOf(local), ['src/App.test.tsx', 'src/features/paldex/PaldexPage.test.tsx', 'src/styles/button-interactions.test.ts'])
  assert.deepEqual(local.browserScenes, ['paldex'])
  assert.deepEqual(plan(['src/styles.css'], { delivery: true }).browserScenes, ['paldex', 'breeding', 'assistant', 'theme', 'shared'])
  assert.ok(buildDependencyGraph(fixture).reverse.get('src/styles.css').has('src/styles/button-interactions.test.ts'))
})

test('CLI helpers select all importing tests without unrelated UI', () => {
  const result = plan(['cli/test-helpers.ts'])
  assert.deepEqual(testsOf(result), ['cli/identity.test.ts', 'cli/output.test.ts'])
  assert.deepEqual(commandsOf(result), ['vitest', 'diff-check', 'typecheck'])
  assert.ok(commandsOf(plan(['cli/test-helpers.ts'], { delivery: true })).includes('cli:build'))
})

test('data and Electron contract changes schedule independent appropriate gates', () => {
  const data = plan(['public/data/manifest.json'], { delivery: true })
  assert.ok(commandsOf(data).includes('test:browser'))
  assert.ok(commandsOf(data).includes('verify:electron'))
  assert.ok(!commandsOf(data).includes('data:sync'))
  assert.ok(!commandsOf(data).includes('package:exe'))
  const electron = plan(['script/electron/main.cjs'], { delivery: true })
  assert.ok(commandsOf(electron).includes('verify:electron'))
  assert.ok(!commandsOf(electron).includes('test:browser'))
  assert.deepEqual(plan(['script/electron/main.cjs']).commands.slice(-3).map(({ id }) => id), ['test:dev-provider', 'test:electron-provider-protocol', 'typecheck'])
})

test('tooling automatically discovers Node tests, including agent timing tests', () => {
  const result = plan([], { requestedCategories: ['tooling'] })
  assert.ok(testsOf(result).includes('script/agent-run-log.node.mjs'))
  assert.ok(testsOf(result).includes('script/test-impact.node.mjs'))
  assert.ok(commandsOf(result).includes('check:node-scripts'))
  assert.deepEqual(testsOf(plan(['script/agent-run-log.mjs'])), ['script/agent-run-log.node.mjs'])
})

test('unknown files and shared test configuration explicitly fall back to all tests', () => {
  for (const file of ['new-file.unknown', 'package.json', 'vitest.config.ts', 'src/domain/no-tests.ts']) {
    const result = plan([file], { delivery: true })
    assert.equal(result.selectedTests.length, Object.keys(fixture).filter((path) => /\.(?:test\.[jt]sx?|node\.mjs)$/.test(path)).length)
    assert.ok(result.fallbackReasons.length > 0)
    assert.ok(commandsOf(result).includes('test:browser'))
    assert.ok(commandsOf(result).includes('verify:electron'))
  }
})

test('parser handles reexports, literal dynamic imports and CommonJS without regex guesses', () => {
  const sources = {
    'src/domain/value.ts': 'export const value = 1',
    'src/domain/barrel.ts': "export { value } from './value'",
    'src/domain/lazy.ts': "export const load = () => import('./barrel')",
    'src/domain/common.cjs': "const value = require('./value.ts'); const resolved = require.resolve('./barrel.ts')",
    'src/domain/resolved.cjs': "const target = require.resolve('./value.ts'); require(target)",
    'src/domain/comment.ts': "// import './not-real'\nconst text = \"require('./not-real')\"",
  }
  const graph = buildDependencyGraph(sources)
  assert.deepEqual([...graph.reverse.get('src/domain/value.ts')].sort(), ['src/domain/barrel.ts', 'src/domain/common.cjs', 'src/domain/resolved.cjs'])
  assert.ok(graph.reverse.get('src/domain/barrel.ts').has('src/domain/lazy.ts'))
  assert.deepEqual([...graph.problems], [])
})

test('unresolved and dynamic consumers conservatively broaden any executable change', () => {
  for (const source of ["import './missing'", 'export const load = (path) => import(path)', 'const load = (path) => require(path)', "const target = require.resolve('./isolated'); function load(target) { return require(target) }", 'this is invalid TypeScript']) {
    const sources = { ...fixture, 'src/domain/search.ts': source }
    assert.ok(plan(['src/domain/search.ts'], { sources }).fallbackReasons.length)
    assert.ok(plan(['src/domain/isolated.ts'], { sources }).fallbackReasons.length)
    assert.deepEqual(plan(['README.md'], { sources }).fallbackReasons, [])
  }
})

test('directory URL readers cover every contained stylesheet without a false unresolved import', () => {
  const sources = { ...fixture, 'src/theme/theme.test.ts': "const styles = new URL('../styles/', import.meta.url)" }
  const result = plan(['src/styles/paldex.css'], { sources, files: Object.keys(sources) })
  assert.ok(testsOf(result).includes('src/theme/theme.test.ts'))
  assert.deepEqual(result.fallbackReasons, [])
})

test('new modules and deleted paths preserve importing tests; renamed files include both sides', () => {
  const deleted = { ...fixture }
  delete deleted['src/domain/search.ts']
  assert.ok(testsOf(plan(['src/domain/search.ts'], { sources: deleted, files: Object.keys(deleted) })).includes('src/features/paldex/PaldexPage.test.tsx'))
  const added = { ...fixture, 'src/domain/new.ts': 'export const value = 1', 'src/domain/new.test.ts': "import { value } from './new'" }
  assert.deepEqual(testsOf(plan(['src/domain/new.ts', 'src/domain/new.test.ts'], { sources: added, files: Object.keys(added) })), ['src/domain/new.test.ts'])
  const renamed = { ...deleted, 'src/domain/renamed.ts': fixture['src/domain/search.ts'] }
  const result = plan(['src/domain/search.ts', 'src/domain/renamed.ts'], { sources: renamed, files: Object.keys(renamed) })
  assert.ok(testsOf(result).includes('src/domain/search.test.ts'))
  assert.ok(result.fallbackReasons.some((reason) => reason.includes('renamed.ts')))
  const removedTest = { ...fixture }
  delete removedTest['src/domain/isolated.test.ts']
  assert.ok(plan(['src/domain/isolated.test.ts'], { sources: removedTest, files: Object.keys(removedTest) }).fallbackReasons.some((reason) => reason.includes('Deleted test')))
})

test('CLI options compose files/categories and reject accidental omissions', () => {
  const result = parseArguments(['--plan', '--files=a.ts,b.ts', '--files', 'c.ts', '--category=domain,cli', '--delivery'])
  assert.deepEqual(result.files, ['a.ts', 'b.ts', 'c.ts'])
  assert.deepEqual(result.requestedCategories, ['domain', 'cli'])
  assert.equal(result.delivery, true)
  for (const args of [['--files'], ['--category=bogus'], ['--files=a.ts,'], ['--wat'], ['--files', '--plan']]) assert.throws(() => parseArguments(args))
})

function temporaryRepository(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'paltools-test-impact-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const write = (file, content = 'original\n') => {
    mkdirSync(dirname(resolve(root, file)), { recursive: true })
    writeFileSync(resolve(root, file), content)
  }
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, result.error?.message ?? result.stderr)
  }
  git('init', '-q')
  write('.gitignore', 'output/\nignored/\n')
  for (const file of ['staged.ts', 'unstaged.ts', 'deleted.ts', 'old name.ts', 'cancel.ts']) write(file)
  git('add', '.')
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture')
  return { root, write, git }
}

test('Git discovery includes staged, unstaged, untracked, deleted and rename paths', (t) => {
  const { root, write, git } = temporaryRepository(t)
  write('staged.ts', 'staged\n')
  write('cancel.ts', 'staged but reversed in worktree\n')
  git('add', 'staged.ts', 'cancel.ts')
  write('cancel.ts')
  write('unstaged.ts', 'unstaged\n')
  write('new file.ts')
  write('ignored/ignored.ts')
  rmSync(resolve(root, 'deleted.ts'))
  renameSync(resolve(root, 'old name.ts'), resolve(root, 'new name.ts'))
  git('add', 'old name.ts', 'new name.ts')
  assert.deepEqual(discoverChanges(root), ['cancel.ts', 'deleted.ts', 'new file.ts', 'new name.ts', 'old name.ts', 'staged.ts', 'unstaged.ts'])
  const repository = loadRepository(root)
  assert.ok(!repository.files.includes('deleted.ts'))
  assert.ok(repository.files.includes('new file.ts'))
  assert.ok(!repository.files.includes('ignored/ignored.ts'))
})

test('execution records elapsed time and preserves first failure exit code', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'paltools-test-impact-run-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const commands = [0, 1, 2].map((index) => ({ id: `step-${index}`, executable: 'node', args: ['-e', ''], reasons: ['fixture'] }))
  let calls = 0
  const result = await executePlan({ commands }, { root, task: 'failure-test', run: async () => ({ code: ++calls === 2 ? 17 : 0 }) })
  assert.equal(result.code, 17)
  assert.equal(calls, 2)
  const records = readFileSync(result.logPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  assert.equal(records[0].event, 'plan')
  assert.equal(records[2].code, 17)
  assert.ok(records[1].durationSec >= 0)
  assert.equal(records[1].task, 'failure-test')
  const agentDirectory = resolve(root, 'output', 'agent-runs')
  const agentRecords = readdirSync(agentDirectory).flatMap((file) => readFileSync(resolve(agentDirectory, file), 'utf8').trim().split('\n').map((line) => JSON.parse(line)))
  assert.deepEqual(agentRecords.map(({ event, step }) => [event, step]), [['start', 'step-0'], ['pass', 'step-0'], ['start', 'step-1'], ['fail', 'step-1']])
  assert.equal(agentRecords[3].durationSec, result.results[1].durationSec)
})

test('real child-process failure returns its exit code and records failure', async (t) => {
  const root = mkdtempSync(resolve(tmpdir(), 'paltools-test-impact-exit-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = await executePlan({ commands: [{ id: 'expected-failure', executable: 'node', args: ['-e', 'process.exit(23)'], reasons: ['Synthetic exit code check'] }] }, { root, task: 'exit-test' })
  assert.equal(result.code, 23)
  assert.equal(result.results[0].code, 23)
})
