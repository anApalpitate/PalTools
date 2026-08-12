// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  formatAppRouteHash,
  parseAppRouteHash,
  pushAppRoute,
  replaceAppRoute,
  type AppRoute,
} from './app-route'

describe('app route hashes', () => {
  it.each<[string, AppRoute]>([
    ['#/paldex', { tool: 'paldex' }],
    ['#/paldex/SheepBall', { tool: 'paldex', palId: 'SheepBall' }],
    ['#/breeding/forward', { tool: 'breeding', mode: 'forward' }],
    ['#/breeding/reverse', { tool: 'breeding', mode: 'reverse' }],
    [
      '#/breeding/reverse?target=PinkCat',
      { tool: 'breeding', mode: 'reverse', targetId: 'PinkCat' },
    ],
    ['#/breeding/solution', { tool: 'breeding', mode: 'solution' }],
    ['#/settings', { tool: 'settings' }],
  ])('parses and formats %s', (hash, route) => {
    expect(parseAppRouteHash(hash)).toEqual(route)
    expect(formatAppRouteHash(route)).toBe(hash)
  })

  it('round trips encoded identities', () => {
    const detail: AppRoute = { tool: 'paldex', palId: 'Pal / 特殊' }
    const reverse: AppRoute = {
      tool: 'breeding',
      mode: 'reverse',
      targetId: 'Target + 特殊',
    }

    expect(parseAppRouteHash(formatAppRouteHash(detail))).toEqual(detail)
    expect(parseAppRouteHash(formatAppRouteHash(reverse))).toEqual(reverse)
  })

  it.each([
    '',
    '#',
    '#/',
    '#/unknown',
    '#/paldex/',
    '#/paldex/SheepBall/extra',
    '#/paldex?target=SheepBall',
    '#/settings?',
    '#/breeding',
    '#/breeding/unknown',
    '#/breeding/forward?target=SheepBall',
    '#/breeding/solution?target=SheepBall',
    '#/breeding/reverse?',
    '#/breeding/reverse?target=',
    '#/breeding/reverse?target=One&target=Two',
    '#/breeding/reverse?other=SheepBall',
    '#/paldex/%E0%A4%A',
    '#/breeding/reverse?target=%E0%A4%A',
    '#/settings#extra',
  ])('rejects illegal hash %s', (hash) => {
    expect(parseAppRouteHash(hash)).toBeNull()
  })

  it('rejects empty identities when formatting', () => {
    expect(() => formatAppRouteHash({ tool: 'paldex', palId: '' })).toThrow(
      'Route identity must not be empty',
    )
    expect(() =>
      formatAppRouteHash({ tool: 'breeding', mode: 'reverse', targetId: '' }),
    ).toThrow('Route identity must not be empty')
  })
})

describe('app route history writes', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('pushes a route and optional state', () => {
    pushAppRoute(
      { tool: 'breeding', mode: 'reverse', targetId: 'PinkCat' },
      { from: 'paldex-detail' },
    )

    expect(window.location.hash).toBe('#/breeding/reverse?target=PinkCat')
    expect(window.history.state).toEqual({ from: 'paldex-detail' })
  })

  it('replaces a route and optional state', () => {
    replaceAppRoute({ tool: 'paldex', palId: 'SheepBall' }, { direct: true })

    expect(window.location.hash).toBe('#/paldex/SheepBall')
    expect(window.history.state).toEqual({ direct: true })
  })
})
