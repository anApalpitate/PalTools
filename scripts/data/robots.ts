interface RobotsRule {
  type: 'allow' | 'disallow'
  path: string
}

export function rulesForUserAgent(
  robotsText: string,
  requestedUserAgent = '*',
): RobotsRule[] {
  const groups: Array<{ agents: string[]; rules: RobotsRule[] }> = []
  let current: { agents: string[]; rules: RobotsRule[] } | null = null
  let hasRules = false

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue

    const separator = line.indexOf(':')
    if (separator < 0) continue

    const field = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim()

    if (field === 'user-agent') {
      if (!current || hasRules) {
        current = { agents: [], rules: [] }
        groups.push(current)
        hasRules = false
      }
      current.agents.push(value.toLowerCase())
      continue
    }

    if (
      current &&
      (field === 'allow' || field === 'disallow') &&
      value
    ) {
      current.rules.push({ type: field, path: value })
      hasRules = true
    }
  }

  const normalizedAgent = requestedUserAgent.toLowerCase()
  const exact = groups.filter((group) =>
    group.agents.some(
      (agent) => agent !== '*' && normalizedAgent.includes(agent),
    ),
  )
  const selected =
    exact.length > 0
      ? exact
      : groups.filter((group) => group.agents.includes('*'))

  return selected.flatMap((group) => group.rules)
}

export function isPathAllowed(
  robotsText: string,
  pathname: string,
  requestedUserAgent = 'PalTools',
): boolean {
  const matches = rulesForUserAgent(robotsText, requestedUserAgent)
    .filter((rule) => pathname.startsWith(rule.path))
    .sort((a, b) => b.path.length - a.path.length)

  if (matches.length === 0) {
    return true
  }

  const longestLength = matches[0].path.length
  return matches
    .filter((rule) => rule.path.length === longestLength)
    .some((rule) => rule.type === 'allow')
}
