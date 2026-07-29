import { describe, expect, it } from 'vitest'
import { resolveAppVersion } from './app-version'

describe('application version', () => {
  it('normalizes an injected release version', () => {
    expect(resolveAppVersion(' 0.1.0 ')).toBe('0.1.0')
  })

  it.each([undefined, null, '', '   '])(
    'falls back to the development label for %s',
    (value) => {
      expect(resolveAppVersion(value)).toBe('开发版')
    },
  )
})
