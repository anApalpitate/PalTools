import type { GraphViewportV1 } from './breeding-graph'
import type { GraphBounds } from './breeding-forest-layout'

export const GRAPH_MIN_ZOOM = 0.2
export const GRAPH_MAX_ZOOM = 1.5
export const GRAPH_DEFAULT_VIEWPORT: GraphViewportV1 = { x: 0, y: 0, zoom: 1 }

export interface ViewportInsets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ViewportSize {
  width: number
  height: number
}

export function clampGraphZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return GRAPH_DEFAULT_VIEWPORT.zoom
  return Math.min(GRAPH_MAX_ZOOM, Math.max(GRAPH_MIN_ZOOM, zoom))
}

export function clampGraphViewport(viewport: GraphViewportV1): GraphViewportV1 {
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: clampGraphZoom(viewport.zoom),
  }
}

export function zoomGraphViewportAtPoint(
  viewport: GraphViewportV1,
  nextZoom: number,
  point: { x: number; y: number },
): GraphViewportV1 {
  const current = clampGraphViewport(viewport)
  const zoom = clampGraphZoom(nextZoom)
  const graphX = (point.x - current.x) / current.zoom
  const graphY = (point.y - current.y) / current.zoom
  return {
    x: point.x - graphX * zoom,
    y: point.y - graphY * zoom,
    zoom,
  }
}

export function fitGraphViewport(
  bounds: GraphBounds | null,
  size: ViewportSize,
  insets: Partial<ViewportInsets> = {},
  padding = 48,
): GraphViewportV1 {
  if (!bounds || size.width <= 0 || size.height <= 0) {
    return { ...GRAPH_DEFAULT_VIEWPORT }
  }
  const fullInsets: ViewportInsets = {
    top: insets.top ?? 0,
    right: insets.right ?? 0,
    bottom: insets.bottom ?? 0,
    left: insets.left ?? 0,
  }
  const availableWidth = Math.max(
    1,
    size.width - fullInsets.left - fullInsets.right - padding * 2,
  )
  const availableHeight = Math.max(
    1,
    size.height - fullInsets.top - fullInsets.bottom - padding * 2,
  )
  const zoom = clampGraphZoom(
    Math.min(
      availableWidth / Math.max(bounds.width, 1),
      availableHeight / Math.max(bounds.height, 1),
    ),
  )
  const contentWidth = bounds.width * zoom
  const contentHeight = bounds.height * zoom
  return {
    x:
      fullInsets.left +
      padding +
      (availableWidth - contentWidth) / 2 -
      bounds.x * zoom,
    y:
      fullInsets.top +
      padding +
      (availableHeight - contentHeight) / 2 -
      bounds.y * zoom,
    zoom,
  }
}

export function visibleGraphBounds(
  viewport: GraphViewportV1,
  size: ViewportSize,
  overscan = 320,
): GraphBounds {
  const current = clampGraphViewport(viewport)
  return {
    x: (-current.x - overscan) / current.zoom,
    y: (-current.y - overscan) / current.zoom,
    width: (size.width + overscan * 2) / current.zoom,
    height: (size.height + overscan * 2) / current.zoom,
  }
}

export function graphBoundsIntersect(left: GraphBounds, right: GraphBounds): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  )
}
