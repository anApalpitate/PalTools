import { describe, expect, it } from 'vitest'
import { isMobileDevice } from './device'

describe('isMobileDevice', () => {
  it('detects mobile hints and common mobile user agents', () => {
    expect(
      isMobileDevice({
        userAgent: 'desktop',
        userAgentData: { mobile: true },
      }),
    ).toBe(true)
    expect(isMobileDevice({ userAgent: 'Mozilla/5.0 (iPhone; Mobile)' })).toBe(true)
    expect(
      isMobileDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 15)' }),
    ).toBe(true)
  })

  it('detects iPadOS desktop user agents by touch capability', () => {
    expect(
      isMobileDevice({ userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 5 }),
    ).toBe(true)
  })

  it('keeps narrow or touch-enabled desktop devices supported', () => {
    expect(
      isMobileDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10 }),
    ).toBe(false)
  })
})
