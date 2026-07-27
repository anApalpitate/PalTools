import { describe, expect, it } from 'vitest'
import { isPathAllowed } from './robots'

const robots = `
User-agent: *
Allow: /
Disallow: /api/
Disallow: /private/
Allow: /private/public/
`

describe('isPathAllowed', () => {
  it('allows public pal pages and blocks the API', () => {
    expect(isPathAllowed(robots, '/pals/Lamball')).toBe(true)
    expect(isPathAllowed(robots, '/api/breed')).toBe(false)
  })

  it('uses the longest matching rule', () => {
    expect(isPathAllowed(robots, '/private/public/page')).toBe(true)
  })
})
