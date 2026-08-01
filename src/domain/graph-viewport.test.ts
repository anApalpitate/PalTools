import { describe, expect, it } from 'vitest'
import {
  GRAPH_MAX_ZOOM,
  GRAPH_MIN_ZOOM,
  clampGraphViewport,
  fitGraphViewport,
  revealGraphBounds,
  zoomGraphViewportAtPoint,
} from './graph-viewport'

describe('graph viewport', () => {
  it('clamps restored zoom and repairs non-finite coordinates', () => {
    expect(clampGraphViewport({ x: Number.NaN, y: Infinity, zoom: 9 })).toEqual({
      x: 0,
      y: 0,
      zoom: GRAPH_MAX_ZOOM,
    })
    expect(clampGraphViewport({ x: 1, y: 2, zoom: 0.01 }).zoom).toBe(
      GRAPH_MIN_ZOOM,
    )
  })

  it('keeps the graph point under the pointer while zooming', () => {
    const point = { x: 320, y: 240 }
    const before = { x: 20, y: 40, zoom: 1 }
    const after = zoomGraphViewportAtPoint(before, 1.5, point)
    expect((point.x - after.x) / after.zoom).toBeCloseTo(
      (point.x - before.x) / before.zoom,
    )
    expect((point.y - after.y) / after.zoom).toBeCloseTo(
      (point.y - before.y) / before.zoom,
    )
  })

  it('fits wide and tall forests with insets and stable clamping', () => {
    const wide = fitGraphViewport(
      { x: 100, y: 50, width: 1600, height: 200 },
      { width: 1200, height: 700 },
      { left: 320, bottom: 72 },
    )
    const tall = fitGraphViewport(
      { x: 0, y: 0, width: 200, height: 3000 },
      { width: 1200, height: 700 },
    )
    expect(wide.zoom).toBeGreaterThanOrEqual(GRAPH_MIN_ZOOM)
    expect(wide.zoom).toBeLessThanOrEqual(GRAPH_MAX_ZOOM)
    expect(tall.zoom).toBeCloseTo(0.2013, 3)
    expect(fitGraphViewport(null, { width: 1200, height: 700 })).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    })
  })

  it('is idempotent for the same bounds and viewport size', () => {
    const args = [
      { x: 0, y: 0, width: 160, height: 72 },
      { width: 900, height: 600 },
      { left: 300, bottom: 60 },
    ] as const
    expect(fitGraphViewport(...args)).toEqual(fitGraphViewport(...args))
  })

  it('minimally reveals bounds without changing zoom', () => {
    const viewport = { x: -600, y: -200, zoom: 1.25 }
    const bounds = { x: 700, y: 300, width: 160, height: 72 }
    const revealed = revealGraphBounds(
      viewport,
      bounds,
      { width: 900, height: 600 },
      { left: 100, bottom: 70 },
    )
    expect(revealed.zoom).toBe(viewport.zoom)
    expect(revealed.x).toBeLessThanOrEqual(viewport.x)
    expect(revealed.y).toBeLessThanOrEqual(viewport.y)
    expect(
      revealGraphBounds(revealed, bounds, { width: 900, height: 600 }, {
        left: 100,
        bottom: 70,
      }),
    ).toEqual(revealed)
  })
})
