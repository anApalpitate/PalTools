import { posix } from 'node:path'
// Vite's locked rolldown dependency supplies the TS/TSX parser, including type imports.
// An unavailable parser must fail the entry point, never silently omit dependencies.
import { parseSync } from 'rolldown/utils'

export const categories = ['docs', 'domain', 'storage-hooks', 'components', 'data', 'cli', 'provider-electron', 'tooling']
export const browserScenes = ['paldex', 'breeding', 'assistant', 'theme', 'shared']
const codePattern = /\.(?:[cm]?[jt]sx?)$/
const vitestPattern = /\.test\.[jt]sx?$/
const nodeTestPattern = /\.node\.[cm]?js$/
const extensions = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '/index.ts', '/index.tsx', '/index.js']
const normalize = (file) => posix.normalize(file.replaceAll('\\', '/')).replace(/^\.\//, '')
const sorted = (values) => [...new Set(values)].sort()

export function classifyFile(file) {
  file = normalize(file)
  if (file.startsWith('docs/') || /^(?:README|AGENTS)\.md$/.test(file) || /^script\/lint-docs/.test(file)) return 'docs'
  if (/^(?:script\/(?:electron\/|development\/|test-(?:dev-provider|electron-provider-protocol)|build-electron-provider-protocol)|src\/(?:domain\/provider-|lib\/provider-service))/.test(file)) return 'provider-electron'
  if (/^(?:src\/storage\/|src\/hooks\/|src\/features\/[^/]+\/use[A-Z])/.test(file)) return 'storage-hooks'
  if (/^(?:src\/(?:features|components|theme|styles)\/|src\/(?:App|main)\.|src\/styles\.css|tests\/e2e\/)/.test(file)) return 'components'
  if (/^(?:src\/domain\/|src\/lib\/)/.test(file)) return 'domain'
  if (/^(?:pipeline\/data\/|data\/|public\/)/.test(file)) return 'data'
  if (file.startsWith('cli/') || file === 'script/build-cli.mjs' || file === 'script/paltools.cmd') return 'cli'
  if (/^script\//.test(file) || /^(?:package(?:-lock)?\.json|(?:tsconfig|vite\.config|vitest\.config)[^/]*|index\.html|\.nvmrc|\.gitignore|icon\.(?:png|ico))$/.test(file)) return 'tooling'
  return null
}

function literal(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0].value.cooked
  return undefined
}

function visit(node, callback) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') callback(node)
  for (const [key, value] of Object.entries(node)) {
    if (key === 'comments') continue
    if (Array.isArray(value)) value.forEach((item) => visit(item, callback))
    else if (value && typeof value === 'object') visit(value, callback)
  }
}

export function buildDependencyGraph(sources, availableFiles = Object.keys(sources)) {
  const files = new Set(availableFiles.map(normalize))
  const reverse = new Map()
  const problems = new Map()
  const addProblem = (file, reason) => problems.set(file, [...(problems.get(file) ?? []), reason])
  const addEdge = (dependency, importer) => {
    if (!reverse.has(dependency)) reverse.set(dependency, new Set())
    reverse.get(dependency).add(importer)
  }
  for (const [rawFile, source] of Object.entries(sources)) {
    const file = normalize(rawFile)
    if (!codePattern.test(file)) continue
    let result
    try { result = parseSync(file, source) } catch (error) {
      addProblem(file, `Cannot parse ${file}: ${error.message}`)
      continue
    }
    if (result.errors.length) {
      addProblem(file, `Cannot parse ${file}: ${result.errors[0].message}`)
      continue
    }
    const requests = new Set()
    const resolvedConstants = new Map()
    const uncertainBindings = new Set()
    const markBindings = (binding) => visit(binding, (node) => {
      if (node.type === 'Identifier') uncertainBindings.add(node.name)
    })
    visit(result.program, (node) => {
      if (Array.isArray(node.params)) node.params.forEach(markBindings)
      if (node.type === 'CatchClause') markBindings(node.param)
      if (node.type === 'AssignmentExpression') markBindings(node.left)
      if (node.type === 'UpdateExpression') markBindings(node.argument)
      if (node.type === 'ImportDeclaration') node.specifiers.forEach((specifier) => markBindings(specifier.local))
      if (node.type !== 'VariableDeclaration') return
      for (const declaration of node.declarations) {
        const init = declaration.init
        let resolved = false
        if (node.kind === 'const' && declaration.id?.type === 'Identifier' && init?.type === 'CallExpression' && init.callee?.object?.name === 'require' && init.callee?.property?.name === 'resolve') {
          const request = literal(init.arguments[0])
          if (request !== undefined) {
            if (!resolvedConstants.has(declaration.id.name)) resolvedConstants.set(declaration.id.name, new Set())
            resolvedConstants.get(declaration.id.name).add(request)
            resolved = true
          }
        }
        if (!resolved) markBindings(declaration.id)
      }
    })
    for (const name of uncertainBindings) resolvedConstants.delete(name)
    visit(result.program, (node) => {
      if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) requests.add(literal(node.source))
      if (node.type === 'TSImportType') requests.add(literal(node.argument ?? node.parameter))
      const requireCall = node.type === 'CallExpression' && (node.callee?.name === 'require' || (node.callee?.object?.name === 'require' && node.callee?.property?.name === 'resolve'))
      if (node.type === 'ImportExpression' || requireCall) {
        const argument = node.type === 'ImportExpression' ? node.source : node.arguments[0]
        const request = literal(argument)
        if (request === undefined && requireCall && argument?.type === 'Identifier' && resolvedConstants.has(argument.name)) {
          for (const resolved of resolvedConstants.get(argument.name)) requests.add(resolved)
        } else if (request === undefined) addProblem(file, `Dynamic dependency in ${file} cannot be resolved statically`)
        else requests.add(request)
      }
      if (node.type === 'NewExpression' && node.callee?.name === 'URL' && node.arguments[1]?.type === 'MemberExpression' && node.arguments[1]?.object?.type === 'MetaProperty') {
        const request = literal(node.arguments[0])
        if (request?.startsWith('.')) requests.add(request)
      }
    })
    for (const request of requests) {
      if (request === undefined) {
        addProblem(file, `Unrecognized dependency syntax in ${file}`)
        continue
      }
      if (!request.startsWith('.')) {
        if (request.startsWith('/') || request.startsWith('@/') || request.startsWith('~/')) addProblem(file, `Unmapped import ${request} in ${file}`)
        continue
      }
      const base = normalize(posix.join(posix.dirname(file), request.split('?')[0]))
      if (request.endsWith('/')) {
        const contents = [...files].filter((candidate) => candidate.startsWith(base.endsWith('/') ? base : `${base}/`))
        if (contents.length) {
          contents.forEach((dependency) => addEdge(dependency, file))
          continue
        }
      }
      // The Electron bundle is generated from this source; it is not an input file.
      if (base === 'build/electron/provider-protocol.cjs') {
        addEdge('src/domain/provider-protocol.ts', file)
        continue
      }
      const candidates = [base]
      if (/\.[cm]?js$/.test(base)) candidates.push(base.replace(/\.[cm]?js$/, '.ts'), base.replace(/\.[cm]?js$/, '.tsx'))
      for (const extension of extensions) candidates.push(base + extension)
      const resolved = candidates.find((candidate) => files.has(candidate))
      if (resolved) addEdge(resolved, file)
      else addProblem(file, `Unresolved local dependency ${request} in ${file}`)
    }
  }
  return { reverse, problems }
}

function consumersOf(start, graph) {
  const paths = new Map([[start, [start]]])
  for (const [file, chain] of paths) {
    for (const consumer of graph.reverse.get(file) ?? []) {
      if (!paths.has(consumer)) paths.set(consumer, [...chain, consumer])
    }
  }
  return paths
}

function scenesFor(file) {
  if (/^src\/storage\/agent-storage\.|^src\/hooks\/useProviderProfiles\./.test(file)) return ['assistant', 'theme']
  if (/^src\/storage\/breeding-workspace\./.test(file)) return ['breeding']
  if (/^src\/hooks\/use(?:FocusTrap|BodyScrollLock|ScrollActivity)\./.test(file)) return ['shared']
  if (/src\/styles\/(?:paldex|detail)\.css|src\/features\/paldex\//.test(file)) return ['paldex']
  if (/src\/styles\/breeding|src\/features\/breeding\//.test(file)) return ['breeding']
  if (/src\/styles\/assistant\.css|src\/features\/assistant\//.test(file)) return ['assistant']
  if (/src\/theme\/|src\/styles\/(?:theme|settings)|src\/features\/settings\//.test(file)) return ['theme', 'assistant']
  return browserScenes
}

export function createTestPlan({ changedFiles = [], files, sources, requestedCategories = [], delivery = false }) {
  const available = sorted(files.map(normalize))
  const changed = sorted(changedFiles.map(normalize))
  const graph = buildDependencyGraph(sources, [...available, ...changed])
  const selected = new Map()
  const commandMap = new Map()
  const fallbackReasons = []
  const selectedCategories = new Set(requestedCategories)
  const scenes = new Set()
  const allTests = available.filter((file) => vitestPattern.test(file) || nodeTestPattern.test(file))
  // An unreadable consumer or a dynamic import may reference any changed module.
  // Restricting these problems to known reverse edges would hide that consumer.
  if (changed.some((file) => classifyFile(file) !== 'docs')) {
    for (const problems of graph.problems.values()) fallbackReasons.push(...problems)
  }
  const vitestTests = allTests.filter((file) => vitestPattern.test(file))
  const nodeTests = allTests.filter((file) => nodeTestPattern.test(file))
  const addTest = (file, reason) => {
    if (!available.includes(file)) return
    if (!selected.has(file)) selected.set(file, new Set())
    selected.get(file).add(reason)
  }
  const selectWhere = (predicate, reason) => allTests.filter(predicate).forEach((file) => addTest(file, reason))
  const addCommand = (id, args, reason, executable = 'npm') => {
    if (!commandMap.has(id)) commandMap.set(id, { id, executable, args, reasons: [] })
    commandMap.get(id).reasons.push(reason)
  }
  const npm = (id, reason, args = []) => addCommand(id, ['run', id, ...(args.length ? ['--', ...args] : [])], reason)
  const allNodeTests = (reason) => nodeTests.forEach((file) => addTest(file, reason))
  let needsTypecheck = false
  let needsBuild = false
  let needsBrowser = false
  let needsElectron = false
  let needsCliBuild = false
  let needsDataBuild = false
  let needsDataValidate = false
  let needsProvider = false
  let needsDocs = false
  let needsSyntax = false

  const applyCategory = (category, reason) => {
    if (category === 'docs') needsDocs = true
    else needsTypecheck = true
    if (category === 'components' || category === 'storage-hooks') needsBuild = true
    if (category === 'provider-electron') needsProvider = true
    if (category === 'cli') needsCliBuild = true
    if (category === 'tooling') needsSyntax = true
    if (category === 'data') needsDataValidate = true
    if (requestedCategories.includes(category)) {
      selectWhere((file) => classifyFile(file) === category, reason)
      if (category === 'components' || category === 'storage-hooks' || category === 'data') {
        needsBrowser = true
        browserScenes.forEach((scene) => scenes.add(scene))
      }
      if (category === 'data') needsDataBuild = true
      if (category === 'provider-electron') needsElectron = true
      if (category === 'tooling') {
        allNodeTests(reason)
        needsBuild = true
      }
    }
  }

  for (const category of requestedCategories) {
    if (!categories.includes(category)) throw new Error(`Unknown test category: ${category}`)
    applyCategory(category, `Explicit category: ${category}`)
  }

  for (const file of changed) {
    const category = classifyFile(file)
    if (!category) {
      fallbackReasons.push(`No impact mapping for ${file}`)
      continue
    }
    selectedCategories.add(category)
    applyCategory(category, `Changed ${file}`)
    if (category === 'docs') {
      if (/^docs\/_meta\/|^script\/lint-docs/.test(file)) selectWhere((test) => /^script\/lint-docs.*\.node\./.test(test), `Documentation contract: ${file}`)
      continue
    }
    const consumers = consumersOf(file, graph)
    let covered = false
    for (const [consumer, chain] of consumers) {
      if (allTests.includes(consumer)) {
        addTest(consumer, `Dependency: ${chain.join(' -> ')}`)
        covered = true
      }
      for (const problem of graph.problems.get(consumer) ?? []) fallbackReasons.push(problem)
      if (consumer.startsWith('src/') && !vitestPattern.test(consumer)) needsBuild = true
      if (consumer.startsWith('cli/')) needsCliBuild = true
      if (consumer.startsWith('script/electron/')) needsProvider = true
    }
    if (vitestPattern.test(file) || nodeTestPattern.test(file)) {
      covered = true
      if (!available.includes(file)) fallbackReasons.push(`Deleted test requires broad coverage: ${file}`)
    }
    if (/^src\/styles(?:\/|\.css$)/.test(file)) {
      selectWhere((test) => test === 'src/styles/button-interactions.test.ts' || test === 'src/App.test.tsx' || (test.startsWith('src/features/') && scenesFor(file).some((scene) => test.includes(`/${scene === 'theme' ? 'settings' : scene}/`))), `Stylesheet consumer: ${file}`)
      covered = true
    }
    if (category === 'components' || category === 'storage-hooks') {
      needsBrowser = true
      scenesFor(file).forEach((scene) => scenes.add(scene))
      if (file.startsWith('src/hooks/') || file.startsWith('src/storage/')) {
        // Storage and common hooks can cross pages; preserve shared interaction checks.
        for (const consumer of consumers.keys()) if (consumer.startsWith('src/features/')) scenesFor(consumer).forEach((scene) => scenes.add(scene))
      }
    }
    if (category === 'provider-electron') {
      needsElectron = true
      covered = true
    }
    if (category === 'data') {
      selectWhere((test) => test.startsWith('pipeline/data/'), `Data pipeline boundary: ${file}`)
      covered = true
      needsDataBuild ||= /^(?:pipeline\/data\/(?:build|config|validate)\.ts|pipeline\/data\/paldb\/schema\.ts|data\/)/.test(file)
      if (/^public\/|^pipeline\/data\/(?:build|config|validate)\.ts/.test(file)) {
        selectWhere((test) => /^(?:src\/domain\/runtime-data|src\/hooks\/useCatalogData|src\/App|cli\/data-loader)\.test\./.test(test), `Published data contract: ${file}`)
        needsBrowser = true
        needsElectron = true
        browserScenes.forEach((scene) => scenes.add(scene))
      }
    }
    if (file === 'src/domain/types.ts' || file === 'src/domain/runtime-data.ts' || file === 'src/domain/knowledge-contract.ts') {
      selectWhere((test) => vitestPattern.test(test), `Shared runtime contract: ${file}`)
      needsBrowser = true
      needsElectron = true
      browserScenes.forEach((scene) => scenes.add(scene))
    }
    if (/^(?:package(?:-lock)?\.json|(?:tsconfig|vite\.config|vitest\.config)[^/]*|index\.html|\.nvmrc)$/.test(file) || /^script\/(?:package-|prepare-electron)/.test(file)) {
      fallbackReasons.push(`Shared build/test configuration requires broad coverage: ${file}`)
      covered = true
    }
    if (category === 'tooling' && covered) needsSyntax = true
    if (!covered) fallbackReasons.push(`No test consumer or explicit coverage mapping for ${file}`)
  }

  if (fallbackReasons.length) {
    const reason = `Conservative fallback: ${sorted(fallbackReasons).join('; ')}`
    allTests.forEach((test) => addTest(test, reason))
    needsTypecheck = needsSyntax = needsProvider = needsDocs = true
    needsBuild = needsBrowser = needsElectron = needsCliBuild = true
    browserScenes.forEach((scene) => scenes.add(scene))
  }
  const selectedTests = [...selected].sort(([a], [b]) => a.localeCompare(b)).map(([file, reasons]) => ({ file, category: classifyFile(file), reasons: [...reasons] }))
  const selectedVitest = selectedTests.filter(({ file }) => vitestPattern.test(file)).map(({ file }) => file)
  const integratedBuild = delivery && (needsBuild || needsBrowser || needsElectron)
  const providerNodeTest = 'script/test-dev-provider.node.cjs'
  const providerNodeCovered = needsProvider || integratedBuild
  const selectedNode = selectedTests.filter(({ file }) => nodeTestPattern.test(file) && (!providerNodeCovered || file !== providerNodeTest)).map(({ file }) => file)
  if (selectedVitest.length) addCommand('vitest', ['test', '--', ...selectedVitest], `${selectedVitest.length} affected Vitest files; package script retains --maxWorkers=4`)
  if (selectedNode.length) addCommand('node-tests', ['--test', ...selectedNode], `${selectedNode.length} affected Node test files`, 'node')
  if (needsSyntax) npm('check:node-scripts', 'Node script or build tooling changed')
  if (needsDocs) npm('docs:lint', 'Documentation, documentation contract, or conservative fallback')
  if (changed.length || requestedCategories.length) addCommand('diff-check', ['diff', '--check'], 'Check modified-file whitespace', 'git')
  if (needsDataBuild) npm('data:build', 'Data generation inputs or schema changed; no network synchronization')
  if (needsProvider && !integratedBuild) {
    npm('test:dev-provider', 'Provider gateway/development contract')
    npm('test:electron-provider-protocol', 'Shared Electron protocol contract')
  }
  if (needsDataValidate && !integratedBuild) npm('data:validate', 'Data source or published artifacts changed')
  if (needsTypecheck && !integratedBuild) npm('typecheck', 'Affected TypeScript or script boundary')
  if (delivery) {
    const selectedScenes = browserScenes.filter((scene) => scenes.has(scene)).join(',')
    if (needsBrowser && needsElectron) {
      npm('verify', 'Browser and Electron checks share a verified build in this process', [`--browser=${selectedScenes}`, '--electron'])
    } else if (needsBrowser) npm('test:browser', 'Affected browser scenes; includes production build', [`--scenes=${selectedScenes}`])
    else if (needsElectron) npm('verify:electron', 'Affected Electron/shared runtime boundary; includes production build')
    if (needsBuild && !needsBrowser && !needsElectron) npm('build', 'Production consumer of changed code')
    if (needsCliBuild) npm('cli:build', 'Affected CLI entry point or consumer')
  }
  if (providerNodeCovered && selected.has(providerNodeTest)) {
    const coveringCommand = [...commandMap.values()].find(({ id }) => ['test:dev-provider', 'build', 'test:browser', 'verify:electron', 'verify'].includes(id))
    coveringCommand.reasons.push(`Covers selected ${providerNodeTest} through the provider contract`)
  }
  return {
    changedFiles: changed,
    categories: categories.filter((category) => selectedCategories.has(category)),
    delivery,
    selectedTests,
    browserScenes: browserScenes.filter((scene) => scenes.has(scene)),
    commands: [...commandMap.values()],
    fallbackReasons: sorted(fallbackReasons),
    inventory: { vitestFiles: vitestTests.length, nodeFiles: nodeTests.length },
  }
}
