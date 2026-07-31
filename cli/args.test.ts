import { describe, expect, it } from 'vitest'
import { HELP_TEXT, parseArgs } from './args'

describe('parseArgs', () => {
  it('parses help and version', () => {
    expect(parseArgs(['--help'])).toMatchObject({
      kind: 'command',
      command: { kind: 'help' },
    })
    expect(parseArgs(['-v'])).toMatchObject({
      kind: 'command',
      command: { kind: 'version' },
    })
  })

  it('parses info with data dir and json', () => {
    const parsed = parseArgs(['info', '--json', '--data-dir', 'x/data'])
    expect(parsed).toMatchObject({
      kind: 'command',
      command: { kind: 'info', json: true },
      dataDir: 'x/data',
    })
  })

  it('parses search with defaults and flags', () => {
    const parsed = parseArgs([
      'search',
      '棉悠',
      '--element',
      'fire',
      '--work',
      '搬运',
      '--work',
      '点火',
      '--sort',
      'attack',
      '--dir',
      'desc',
      '--limit',
      '10',
    ])
    expect(parsed.kind).toBe('command')
    if (parsed.kind === 'command') {
      expect(parsed.command).toMatchObject({
        kind: 'search',
        query: '棉悠',
        element: 'fire',
        workTypes: ['搬运', '点火'],
        sortKey: 'attack',
        sortDirection: 'desc',
        limit: 10,
        json: false,
      })
    }
  })

  it('parses forward parents and reverse target', () => {
    const forward = parseArgs(['forward', '--parents', 'SheepBall, PinkCat'])
    expect(forward.kind).toBe('command')
    if (forward.kind === 'command') {
      expect(forward.command).toMatchObject({
        kind: 'forward',
        parentA: 'SheepBall',
        parentB: 'PinkCat',
      })
    }

    const reverse = parseArgs(['reverse', '--target=ChickenPal', '--json'])
    expect(reverse.kind).toBe('command')
    if (reverse.kind === 'command') {
      expect(reverse.command).toMatchObject({
        kind: 'reverse',
        target: 'ChickenPal',
        json: true,
      })
    }
  })

  it('parses plan validate', () => {
    const parsed = parseArgs(['plan', 'validate', 'plan.json'])
    expect(parsed.kind).toBe('command')
    if (parsed.kind === 'command') {
      expect(parsed.command).toMatchObject({
        kind: 'plan-validate',
        file: 'plan.json',
      })
    }
  })

  it.each([
    ['search', ['search', '--limit', '0']],
    ['search', ['search', '--sort', 'bogus']],
    ['search', ['search', '--element', 'bogus']],
    ['forward', ['forward']],
    ['forward', ['forward', '--parents', 'OnlyOne']],
    ['reverse', ['reverse']],
    ['plan', ['plan', 'validate']],
    ['unknown', ['bogus']],
    ['flag', ['search', '--bogus', 'x']],
  ])('rejects invalid %s arguments', (_label, argv) => {
    expect(parseArgs(argv).kind).toBe('usage-error')
  })

  it('keeps json on usage errors', () => {
    expect(parseArgs(['search', '--limit', '0', '--json'])).toMatchObject({
      kind: 'usage-error',
      json: true,
    })
  })

  it('exposes help text', () => {
    expect(HELP_TEXT).toContain('paltools plan validate')
    expect(HELP_TEXT).toContain('退出码')
  })
})
