export type BreedingMode = 'forward' | 'reverse' | 'solution'

export type AppRoute =
  | { tool: 'paldex'; palId?: string }
  | { tool: 'breeding'; mode: 'forward'; parentAId?: string; parentBId?: string }
  | { tool: 'breeding'; mode: 'solution' }
  | { tool: 'breeding'; mode: 'reverse'; targetId?: string }
  | { tool: 'assistant'; conversationId?: string }
  | { tool: 'settings' }

export function parseAppRouteHash(hash: string): AppRoute | null {
  if (!hash.startsWith('#/') || hash.includes('#', 1)) return null

  const questionMark = hash.indexOf('?')
  const path = hash.slice(1, questionMark === -1 ? undefined : questionMark)
  const query = questionMark === -1 ? undefined : hash.slice(questionMark + 1)

  if (path === '/paldex') {
    return query === undefined ? { tool: 'paldex' } : null
  }

  const paldexDetailMatch = path.match(/^\/paldex\/([^/]+)$/)
  if (paldexDetailMatch) {
    if (query !== undefined) return null
    const palId = decodeRouteValue(paldexDetailMatch[1])
    return palId === null ? null : { tool: 'paldex', palId }
  }

  if (path === '/settings') {
    return query === undefined ? { tool: 'settings' } : null
  }

  if (path === '/assistant') {
    return query === undefined ? { tool: 'assistant' } : null
  }

  const assistantMatch = path.match(/^\/assistant\/([^/]+)$/)
  if (assistantMatch) {
    if (query !== undefined) return null
    const conversationId = decodeRouteValue(assistantMatch[1])
    return conversationId === null ? null : { tool: 'assistant', conversationId }
  }

  const breedingMatch = path.match(/^\/breeding\/(forward|reverse|solution)$/)
  if (!breedingMatch) return null

  const mode = breedingMatch[1] as BreedingMode
  if (mode === 'solution') {
    return query === undefined ? { tool: 'breeding', mode } : null
  }
  if (mode === 'forward') {
    if (query === undefined) return { tool: 'breeding', mode }
    const params = new URLSearchParams(query)
    if ([...params.keys()].some((key) => key !== 'parentA' && key !== 'parentB') || params.getAll('parentA').length > 1 || params.getAll('parentB').length > 1) return null
    const parentAId = params.has('parentA') ? decodeRouteValue(params.get('parentA') ?? '') : undefined
    const parentBId = params.has('parentB') ? decodeRouteValue(params.get('parentB') ?? '') : undefined
    if ((params.has('parentA') && parentAId === null) || (params.has('parentB') && parentBId === null) || (!parentAId && !parentBId)) return null
    return { tool: 'breeding', mode, ...(parentAId ? { parentAId } : {}), ...(parentBId ? { parentBId } : {}) }
  }
  if (query === undefined) return { tool: 'breeding', mode: 'reverse' }

  const targetMatch = query.match(/^target=([^&]+)$/)
  if (!targetMatch) return null
  const targetId = decodeRouteValue(targetMatch[1].replace(/\+/g, ' '))
  return targetId === null
    ? null
    : { tool: 'breeding', mode: 'reverse', targetId }
}

export function formatAppRouteHash(route: AppRoute): string {
  if (route.tool === 'paldex') {
    return route.palId !== undefined
      ? `#/paldex/${encodeRouteValue(route.palId)}`
      : '#/paldex'
  }
  if (route.tool === 'settings') return '#/settings'
  if (route.tool === 'assistant') return route.conversationId ? `#/assistant/${encodeRouteValue(route.conversationId)}` : '#/assistant'
  if (route.mode === 'forward' && (route.parentAId || route.parentBId)) {
    const query = [route.parentAId ? `parentA=${encodeRouteValue(route.parentAId)}` : '', route.parentBId ? `parentB=${encodeRouteValue(route.parentBId)}` : ''].filter(Boolean).join('&')
    return `#/breeding/forward?${query}`
  }
  if (route.mode === 'reverse' && route.targetId !== undefined) {
    return `#/breeding/reverse?target=${encodeRouteValue(route.targetId)}`
  }
  return `#/breeding/${route.mode}`
}

export function pushAppRoute(route: AppRoute, state?: unknown): void {
  window.history.pushState(state, '', formatAppRouteHash(route))
}

export function replaceAppRoute(route: AppRoute, state?: unknown): void {
  window.history.replaceState(state, '', formatAppRouteHash(route))
}

function decodeRouteValue(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value)
    return decoded.length > 0 ? decoded : null
  } catch {
    return null
  }
}

function encodeRouteValue(value: string): string {
  if (value.length === 0) {
    throw new TypeError('Route identity must not be empty')
  }
  return encodeURIComponent(value)
}
