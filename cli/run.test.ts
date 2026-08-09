import { describe, expect, it } from 'vitest'
import { DataUnavailableError } from './data-loader'
import { runCli, type CliDeps } from './run'
import {
  makeTestDataset,
  TEST_BREEDING_INDEX,
  TEST_PALS,
} from './test-helpers'

function makeDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    cwd: 'C:/repo',
    appVersion: '0.1.0',
    loadDataset: () => makeTestDataset(),
    env: {},
    ...overrides,
  }
}

describe('runCli', () => {
  it('prints version', () => {
    const result = runCli(['--version'], makeDeps())
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('0.1.0\n')
  })

  it('shows help on request', () => {
    const result = runCli(['--help'], makeDeps())
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('paltools search')
  })

  it('reports info as json', () => {
    const result = runCli(['info', '--json'], makeDeps())
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      appVersion: '0.1.0',
      datasetVersion: 'test.1',
      recordCounts: { pals: 3, recipes: 1 },
    })
  })

  it('searches pals and returns no-results exit code', () => {
    const hit = runCli(['search', '棉悠', '--json'], makeDeps())
    expect(hit.exitCode).toBe(0)
    expect(JSON.parse(hit.stdout)).toMatchObject({
      count: 1,
      pals: [{ internalId: 'SheepBall' }],
    })

    const miss = runCli(['search', '不存在', '--json'], makeDeps())
    expect(miss.exitCode).toBe(3)
    expect(JSON.parse(miss.stdout)).toMatchObject({
      error: { code: 'no-results' },
    })
  })

  it('runs forward and reverse breeding queries', () => {
    const forward = runCli(
      ['forward', '--parents', 'SheepBall,PinkCat', '--json'],
      makeDeps(),
    )
    expect(forward.exitCode).toBe(0)
    expect(JSON.parse(forward.stdout).recipes).toHaveLength(1)

    const noPair = runCli(
      ['forward', '--parents', 'SheepBall,ChickenPal', '--json'],
      makeDeps(),
    )
    expect(noPair.exitCode).toBe(3)

    const reverse = runCli(['reverse', '--target', 'ChickenPal', '--json'], makeDeps())
    expect(reverse.exitCode).toBe(0)
    expect(JSON.parse(reverse.stdout).recipes[0].child.zhName).toBe('皮皮鸡')
  })

  it('resolves ambiguous parents as usage error', () => {
    const deps = makeDeps({
      loadDataset: () => ({
        ...makeTestDataset(),
        pals: [
          ...TEST_PALS,
          { ...TEST_PALS[1], internalId: 'CatA', paldbId: 'CatA', name: { zhHans: '黑白猫', en: 'CatA' } },
          { ...TEST_PALS[2], internalId: 'CatB', paldbId: 'CatB', name: { zhHans: '橘猫', en: 'CatB' } },
        ],
      }),
    })
    const result = runCli(
      ['forward', '--parents', '猫,Cattiva', '--json'],
      deps,
    )
    expect(result.exitCode).toBe(2)
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: 'usage' },
    })
  })

  it('reports data unavailability with exit code 4', () => {
    const deps = makeDeps({
      loadDataset: () => {
        throw new DataUnavailableError('数据缺失')
      },
    })
    const result = runCli(['info', '--json'], deps)
    expect(result.exitCode).toBe(4)
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: { code: 'data-unavailable' },
    })
  })

  it('reports usage errors with exit code 2', () => {
    const result = runCli(['search', '--limit', '0'], makeDeps())
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('--limit')
  })

  it('honors PALTOOLS_DATA_DIR through env', () => {
    const deps = makeDeps({
      loadDataset: (dataDir) => {
        expect(dataDir).toBe('E:/data')
        return makeTestDataset()
      },
    })
    const result = runCli(['info'], { ...deps, env: { PALTOOLS_DATA_DIR: 'E:/data' } })
    expect(result.exitCode).toBe(0)
  })
})
