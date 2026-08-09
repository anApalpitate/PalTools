import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRONTMATTER_BOUNDARY = '---'
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function parseFrontmatter(content, filePath = '<document>') {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    throw new Error(`${filePath}: missing YAML frontmatter`)
  }
  const closingIndex = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, 4)
  if (closingIndex < 0) {
    throw new Error(`${filePath}: unterminated YAML frontmatter`)
  }

  const metadata = {}
  const header = normalized.slice(4, closingIndex)
  for (const [index, line] of header.split('\n').entries()) {
    if (line.trim() === '') continue
    const separator = line.indexOf(':')
    if (separator <= 0) {
      throw new Error(`${filePath}:${index + 2}: expected "key: value"`)
    }
    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    if (Object.hasOwn(metadata, key)) {
      throw new Error(`${filePath}:${index + 2}: duplicate field "${key}"`)
    }
    metadata[key] = parseValue(rawValue, filePath, index + 2)
  }

  return {
    metadata,
    body: normalized.slice(closingIndex + 5),
  }
}

function parseValue(rawValue, filePath, lineNumber) {
  if (rawValue.startsWith('[')) {
    if (!rawValue.endsWith(']')) {
      throw new Error(`${filePath}:${lineNumber}: arrays must use one-line [a, b] syntax`)
    }
    const inner = rawValue.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((value) => {
      const item = value.trim()
      if (item === '' || item.includes('[') || item.includes(']')) {
        throw new Error(`${filePath}:${lineNumber}: invalid array item`)
      }
      return unquote(item, filePath, lineNumber)
    })
  }
  if (rawValue === '') {
    throw new Error(`${filePath}:${lineNumber}: values must stay on the same line`)
  }
  if (/^-?\d+$/.test(rawValue)) return Number(rawValue)
  return unquote(rawValue, filePath, lineNumber)
}

function unquote(value, filePath, lineNumber) {
  if (!value.startsWith('"')) return value
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`${filePath}:${lineNumber}: invalid quoted string`)
  }
}

export function lintRepository(rootDirectory) {
  const root = resolve(rootDirectory)
  const docsRoot = resolve(root, 'docs')
  const schemaPath = resolve(docsRoot, '_meta', 'wiki-schema.json')
  const errors = []
  let schema

  try {
    schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
  } catch (error) {
    return [`docs/_meta/wiki-schema.json: ${error.message}`]
  }

  const allDocsMarkdown = listFiles(docsRoot).filter((file) => extname(file) === '.md')
  const managedFiles = allDocsMarkdown.filter(
    (file) => !toPosix(relative(root, file)).startsWith('docs/archive/'),
  )
  const pages = []

  for (const file of managedFiles) {
    const relativePath = toPosix(relative(root, file))
    try {
      const parsed = parseFrontmatter(readFileSync(file, 'utf8'), relativePath)
      pages.push({ file, relativePath, ...parsed })
      validateMetadata(parsed.metadata, schema, relativePath, root, errors)
    } catch (error) {
      errors.push(error.message)
    }
  }

  const pageById = new Map()
  for (const page of pages) {
    const id = page.metadata.id
    if (typeof id !== 'string') continue
    const duplicate = pageById.get(id)
    if (duplicate) {
      errors.push(`${page.relativePath}: duplicate id "${id}" also used by ${duplicate.relativePath}`)
    } else {
      pageById.set(id, page)
    }
  }

  for (const page of pages) {
    if (!Array.isArray(page.metadata.related)) continue
    for (const relatedId of page.metadata.related) {
      if (relatedId === page.metadata.id) {
        errors.push(`${page.relativePath}: related must not reference its own id "${relatedId}"`)
      } else if (!pageById.has(relatedId)) {
        errors.push(`${page.relativePath}: related references unknown id "${relatedId}"`)
      }
    }
  }

  const markdownToCheck = [...allDocsMarkdown]
  const projectReadme = resolve(root, 'README.md')
  if (existsSync(projectReadme)) markdownToCheck.push(projectReadme)
  for (const file of markdownToCheck) {
    validateMarkdownLinks(file, root, errors)
  }

  ensureDirectIndexCoverage(root, 'docs/reference/README.md', 'docs/reference', errors)
  ensureDirectIndexCoverage(root, 'docs/decisions/README.md', 'docs/decisions', errors)
  ensureDirectIndexCoverage(root, 'docs/tasks/README.md', 'docs/tasks', errors)
  ensureDirectIndexCoverage(root, 'docs/archive/README.md', 'docs/archive', errors)

  const docsIndex = resolve(root, 'docs/README.md')
  for (const target of [
    'docs/_meta/wiki-contract.md',
    'docs/_meta/wiki-schema.json',
    'docs/reference/README.md',
    'docs/decisions/README.md',
    'docs/tasks/README.md',
    'docs/archive/README.md',
  ]) {
    if (!documentLinksTo(docsIndex, resolve(root, target))) {
      errors.push(`docs/README.md: index does not link to ${target}`)
    }
  }

  return [...new Set(errors)].sort()
}

function validateMetadata(metadata, schema, relativePath, root, errors) {
  const required = new Set(schema.requiredFields ?? [])
  for (const field of required) {
    if (!Object.hasOwn(metadata, field)) {
      errors.push(`${relativePath}: missing required field "${field}"`)
    }
  }
  for (const field of Object.keys(metadata)) {
    if (!required.has(field)) {
      errors.push(`${relativePath}: unknown field "${field}"`)
    }
  }

  if (metadata.schema_version !== schema.schemaVersion) {
    errors.push(`${relativePath}: schema_version must be ${schema.schemaVersion}`)
  }
  if (typeof metadata.id !== 'string' || !ID_PATTERN.test(metadata.id)) {
    errors.push(`${relativePath}: id must use lowercase kebab-case`)
  }
  for (const field of ['title', 'summary']) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      errors.push(`${relativePath}: ${field} must be a non-empty string`)
    }
  }
  validateEnum(metadata.type, schema.types, 'type', relativePath, errors)
  validateEnum(metadata.status, schema.statuses, 'status', relativePath, errors)
  validateEnum(metadata.authority, schema.authorities, 'authority', relativePath, errors)
  validateArray(metadata.domains, schema.domains, 'domains', relativePath, errors, false)
  validateArray(metadata.topics, schema.topics, 'topics', relativePath, errors, false)
  validateArray(metadata.platforms, schema.platforms, 'platforms', relativePath, errors, false)
  validateArray(metadata.related, null, 'related', relativePath, errors, true)
  validateArray(metadata.source_of_truth, null, 'source_of_truth', relativePath, errors, false)

  if (Array.isArray(metadata.source_of_truth)) {
    for (const source of metadata.source_of_truth) {
      if (typeof source !== 'string' || source.trim() === '') continue
      const normalized = toPosix(source)
      if ((metadata.type === 'reference' || metadata.type === 'decision') && normalized.startsWith('docs/tasks/')) {
        errors.push(`${relativePath}: canonical knowledge must not use tasks as source_of_truth (${source})`)
      }
      const sourcePath = resolve(root, source)
      if (!isWithin(root, sourcePath) || !existsSync(sourcePath)) {
        errors.push(`${relativePath}: source_of_truth path does not exist (${source})`)
      }
    }
  }
}

function validateEnum(value, allowed, field, relativePath, errors) {
  if (!Array.isArray(allowed) || !allowed.includes(value)) {
    errors.push(`${relativePath}: invalid ${field} "${String(value)}"`)
  }
}

function validateArray(value, allowed, field, relativePath, errors, allowEmpty) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${relativePath}: ${field} must be ${allowEmpty ? 'an array' : 'a non-empty array'}`)
    return
  }
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(`${relativePath}: ${field} contains a non-string or empty value`)
      continue
    }
    if (seen.has(item)) errors.push(`${relativePath}: ${field} contains duplicate "${item}"`)
    seen.add(item)
    if (allowed && !allowed.includes(item)) {
      errors.push(`${relativePath}: invalid ${field} value "${item}"`)
    }
  }
}

function validateMarkdownLinks(file, root, errors) {
  const relativePath = toPosix(relative(root, file))
  const content = readFileSync(file, 'utf8')
  for (const link of extractLinks(content)) {
    if (isExternalOrAnchor(link)) continue
    const target = resolveLink(file, link)
    if (!isWithin(root, target) || !existsSync(target)) {
      errors.push(`${relativePath}: broken relative link (${link})`)
    }
  }
}

function ensureDirectIndexCoverage(root, indexRelativePath, directoryRelativePath, errors) {
  const indexPath = resolve(root, indexRelativePath)
  const directory = resolve(root, directoryRelativePath)
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name) !== '.md' || entry.name === 'README.md') continue
    const target = resolve(directory, entry.name)
    if (!documentLinksTo(indexPath, target)) {
      errors.push(`${indexRelativePath}: index does not link to ${toPosix(relative(root, target))}`)
    }
  }
}

function documentLinksTo(documentPath, targetPath) {
  const content = readFileSync(documentPath, 'utf8')
  return extractLinks(content)
    .filter((link) => !isExternalOrAnchor(link))
    .some((link) => resolveLink(documentPath, link) === resolve(targetPath))
}

function extractLinks(content) {
  const links = []
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g
  for (const match of content.matchAll(pattern)) {
    let target = match[1].trim()
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1)
    links.push(target)
  }
  return links
}

function resolveLink(documentPath, link) {
  const withoutFragment = link.split('#', 1)[0]
  let decoded = withoutFragment
  try {
    decoded = decodeURIComponent(withoutFragment)
  } catch {
    // An invalid escape remains a path and will fail the existence check.
  }
  return resolve(dirname(documentPath), decoded)
}

function isExternalOrAnchor(link) {
  return link.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(link)
}

function listFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function isWithin(root, target) {
  const pathFromRoot = relative(root, target)
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot))
}

function toPosix(path) {
  return path.replaceAll('\\', '/')
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedPath === fileURLToPath(import.meta.url)) {
  const errors = lintRepository(process.cwd())
  if (errors.length > 0) {
    console.error(`Documentation lint failed with ${errors.length} error(s):`)
    for (const error of errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else {
    console.log('Documentation lint passed.')
  }
}
