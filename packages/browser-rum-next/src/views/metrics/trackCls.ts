import type { CumulativeLayoutShift, RumRect } from '../types'

interface LayoutShiftSource {
  node?: Element
  previousRect: DOMRectReadOnly
  currentRect: DOMRectReadOnly
}

interface ClsEntry {
  value: number
  hadRecentInput: boolean
  startTime: number
  sources?: LayoutShiftSource[]
}

interface SessionWindow {
  value: number
  startTime: number
  lastTime: number
  largestShiftValue: number
  largestShiftNode?: Element
  largestShiftPreviousRect?: DOMRectReadOnly
  largestShiftCurrentRect?: DOMRectReadOnly
}

export interface ClsTracker {
  process(entry: ClsEntry): void
  get(): CumulativeLayoutShift | undefined
}

function getImpactedArea(source: LayoutShiftSource): number {
  const prevArea = source.previousRect.width * source.previousRect.height
  const currArea = source.currentRect.width * source.currentRect.height
  const left = Math.max(source.previousRect.x, source.currentRect.x)
  const top = Math.max(source.previousRect.y, source.currentRect.y)
  const right = Math.min(
    source.previousRect.x + source.previousRect.width,
    source.currentRect.x + source.currentRect.width
  )
  const bottom = Math.min(
    source.previousRect.y + source.previousRect.height,
    source.currentRect.y + source.currentRect.height
  )
  const intersection = left < right && top < bottom ? (right - left) * (bottom - top) : 0
  return prevArea + currArea - intersection
}

function getTopSource(sources?: LayoutShiftSource[]): LayoutShiftSource | undefined {
  if (!sources || sources.length === 0) return undefined
  let top: LayoutShiftSource | undefined
  for (const source of sources) {
    if (source.node) {
      if (!top || getImpactedArea(source) > getImpactedArea(top)) {
        top = source
      }
    }
  }
  return top ?? sources[0]
}

function asRumRect(rect: DOMRectReadOnly): RumRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
}

export function trackCls(): ClsTracker {
  let maxWindowValue = 0
  let maxWindowTime = 0
  let maxWindowTargetNode: Element | undefined
  let maxWindowPreviousRect: DOMRectReadOnly | undefined
  let maxWindowCurrentRect: DOMRectReadOnly | undefined
  let currentWindow: SessionWindow | undefined

  return {
    process(entry: ClsEntry): void {
      if (entry.hadRecentInput) {
        return
      }

      const topSource = getTopSource(entry.sources)

      if (
        currentWindow === undefined ||
        entry.startTime - currentWindow.lastTime > 1000 ||
        entry.startTime - currentWindow.startTime >= 5000
      ) {
        currentWindow = {
          value: entry.value,
          startTime: entry.startTime,
          lastTime: entry.startTime,
          largestShiftValue: entry.value,
          largestShiftNode: topSource?.node,
          largestShiftPreviousRect: topSource?.previousRect,
          largestShiftCurrentRect: topSource?.currentRect,
        }
      } else {
        currentWindow.value += entry.value
        currentWindow.lastTime = entry.startTime
        if (entry.value > currentWindow.largestShiftValue) {
          currentWindow.largestShiftValue = entry.value
          currentWindow.largestShiftNode = topSource?.node
          currentWindow.largestShiftPreviousRect = topSource?.previousRect
          currentWindow.largestShiftCurrentRect = topSource?.currentRect
        }
      }

      if (currentWindow.value > maxWindowValue) {
        maxWindowValue = currentWindow.value
        maxWindowTime = currentWindow.lastTime
        maxWindowTargetNode = currentWindow.largestShiftNode
        maxWindowPreviousRect = currentWindow.largestShiftPreviousRect
        maxWindowCurrentRect = currentWindow.largestShiftCurrentRect
      }
    },

    get(): CumulativeLayoutShift | undefined {
      if (maxWindowValue === 0 && currentWindow === undefined) {
        return undefined
      }
      const result: CumulativeLayoutShift = { value: maxWindowValue, time: maxWindowTime }
      const tagName = maxWindowTargetNode?.tagName
      if (tagName) {
        result.targetSelector = tagName.toLowerCase()
      }
      if (maxWindowPreviousRect) {
        result.previousRect = asRumRect(maxWindowPreviousRect)
      }
      if (maxWindowCurrentRect) {
        result.currentRect = asRumRect(maxWindowCurrentRect)
      }
      return result
    },
  }
}
