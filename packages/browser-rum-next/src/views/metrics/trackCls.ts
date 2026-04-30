import type { CumulativeLayoutShift } from '../types'

interface ClsEntry {
  value: number
  hadRecentInput: boolean
  startTime: number
  sources?: Array<{ node?: Element }>
}

interface SessionWindow {
  value: number
  startTime: number
  lastTime: number
  largestShiftValue: number
  largestShiftNode?: Element
}

export interface ClsTracker {
  process(entry: ClsEntry): void
  get(): CumulativeLayoutShift | undefined
}

export function trackCls(): ClsTracker {
  let maxWindowValue = 0
  let maxWindowTime = 0
  let maxWindowTargetNode: Element | undefined
  let currentWindow: SessionWindow | undefined

  return {
    process(entry: ClsEntry): void {
      if (entry.hadRecentInput) {
        return
      }

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
          largestShiftNode: entry.sources?.[0]?.node,
        }
      } else {
        currentWindow.value += entry.value
        currentWindow.lastTime = entry.startTime
        if (entry.value > currentWindow.largestShiftValue) {
          currentWindow.largestShiftValue = entry.value
          currentWindow.largestShiftNode = entry.sources?.[0]?.node
        }
      }

      if (currentWindow.value > maxWindowValue) {
        maxWindowValue = currentWindow.value
        maxWindowTime = currentWindow.lastTime
        maxWindowTargetNode = currentWindow.largestShiftNode
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
      return result
    },
  }
}
