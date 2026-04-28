import type { ActivityResult } from './activityDetector'

interface PendingClick {
  name: string
  targetSelector: string
  positionX: number
  positionY: number
  startTime: number
  startDate: number
  pointerUpDelay: number
  nameSource: string
  targetWidth: number
  targetHeight: number
  activity: ActivityResult
  errorCount: number
  resourceCount: number
  longTaskCount: number
}

const MAX_CLICK_GAP = 1000
const MAX_CLICK_DISTANCE = 100

function createClickChain(
  firstClick: PendingClick,
  onFinalize: (clicks: PendingClick[]) => void
): {
  tryAppend(click: PendingClick): boolean
  stop(): void
} {
  const clicks: PendingClick[] = [firstClick]
  let lastClickTime = firstClick.startTime
  let timer = setTimeout(() => onFinalize(clicks), MAX_CLICK_GAP)

  return {
    tryAppend(click: PendingClick): boolean {
      const timeDelta = click.startTime - lastClickTime
      const distance = Math.sqrt(
        Math.pow(click.positionX - firstClick.positionX, 2) +
          Math.pow(click.positionY - firstClick.positionY, 2)
      )

      if (click.targetSelector !== firstClick.targetSelector) return false
      if (timeDelta > MAX_CLICK_GAP) return false
      if (distance > MAX_CLICK_DISTANCE) return false

      clicks.push(click)
      lastClickTime = click.startTime
      clearTimeout(timer)
      timer = setTimeout(() => onFinalize(clicks), MAX_CLICK_GAP)
      return true
    },
    stop() {
      clearTimeout(timer)
    },
  }
}

export { createClickChain, MAX_CLICK_GAP, MAX_CLICK_DISTANCE }
export type { PendingClick }
