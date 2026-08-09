import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { lintRepository, parseFrontmatter } from './lint-docs.mjs'

const schema = readFileSync(new URL('../docs/_meta/wiki-schema.json', import.meta.url), 'utf8')

test('parses the restricted frontmatter format', () => {
  const parsed = parseFrontmatter(`---\nschema_version: 1\nid: sample-page\ndomains: [tooling, data]\nrelated: []\n---\n# Page\n`)
  assert.equal(parsed.metadata.schema_version, 1)
  assert.deepEqual(parsed.metadata.domains, ['tooling', 'data'])
  assert.deepEqual(parsed.metadata.related, [])
  assert.match(parsed.body, /# Page/)
})

test('accepts a valid indexed wiki', () => {
  withFixture((root) => assert.deepEqual(lintRepository(root), []))
})

test('rejects a tag outside the controlled vocabulary', () => {
  withFixture((root) => {
    replace(root, 'docs/reference/topic.md', 'domains: [product]', 'domains: [unknown-domain]')
    assert.match(lintRepository(root).join('\n'), /invalid domains value "unknown-domain"/)
  })
})

test('rejects duplicate page ids', () => {
  withFixture((root) => {
    write(root, 'docs/reference/other.md', page({ id: 'topic', title: 'Other' }))
    append(root, 'docs/reference/README.md', '\n[Other](other.md)\n')
    assert.match(lintRepository(root).join('\n'), /duplicate id "topic"/)
  })
})

test('rejects a broken relative Markdown link', () => {
  withFixture((root) => {
    append(root, 'docs/reference/topic.md', '\n[Missing](missing.md)\n')
    assert.match(lintRepository(root).join('\n'), /broken relative link \(missing.md\)/)
  })
})

test('rejects a missing source_of_truth path', () => {
  withFixture((root) => {
    replace(root, 'docs/reference/topic.md', 'source_of_truth: [package.json]', 'source_of_truth: [missing.ts]')
    assert.match(lintRepository(root).join('\n'), /source_of_truth path does not exist \(missing.ts\)/)
  })
})

function withFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'paltools-docs-lint-'))
  try {
    write(root, 'package.json', '{}\n')
    write(root, 'README.md', '[Docs](docs/README.md)\n')
    write(root, 'docs/_meta/wiki-schema.json', schema)
    write(root, 'docs/_meta/wiki-contract.md', page({ id: 'wiki-contract', type: 'meta', title: 'Contract' }))
    write(root, 'docs/reference/topic.md', page({ id: 'topic', title: 'Topic', domains: '[product]' }))
    write(root, 'docs/reference/README.md', `${page({ id: 'reference-index', type: 'index', title: 'Reference' })}\n[Topic](topic.md)\n`)
    write(root, 'docs/decisions/README.md', page({ id: 'decisions-index', type: 'index', title: 'Decisions' }))
    write(root, 'docs/tasks/README.md', page({ id: 'tasks-index', type: 'index', title: 'Tasks', authority: 'supporting' }))
    write(root, 'docs/archive/README.md', '# Archive\n')
    write(root, 'docs/README.md', `${page({ id: 'docs-home', type: 'index', title: 'Docs' })}
[Contract](_meta/wiki-contract.md)
[Schema](_meta/wiki-schema.json)
[Reference](reference/README.md)
[Decisions](decisions/README.md)
[Tasks](tasks/README.md)
[Archive](archive/README.md)
`)
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function page({
  id,
  title,
  type = 'reference',
  authority = 'canonical',
  domains = '[tooling]',
}) {
  return `---
schema_version: 1
id: ${id}
title: ${title}
summary: Fixture page.
type: ${type}
status: current
authority: ${authority}
domains: ${domains}
topics: [architecture]
platforms: [shared]
source_of_truth: [package.json]
related: []
---

# ${title}
`
}

function write(root, relativePath, content) {
  const path = join(root, relativePath)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

function append(root, relativePath, content) {
  const path = join(root, relativePath)
  writeFileSync(path, readFileSync(path, 'utf8') + content, 'utf8')
}

function replace(root, relativePath, before, after) {
  const path = join(root, relativePath)
  writeFileSync(path, readFileSync(path, 'utf8').replace(before, after), 'utf8')
}
