import type { Pipeline } from '@datadog/core-next'
import { getActionName } from './getActionName'

interface ClickEvent {
  name: string
  nameSource: string
  targetSelector: string
  targetWidth: number
  targetHeight: number
  positionX: number
  positionY: number
  pointerUpDelay: number
  startTime: number
  startDate: number
}

function computeSelector(element: Element): string {
  const tag = element.tagName.toLowerCase()
  if (element.id) return `${tag}#${element.id}`
  const cls =
    element.className && typeof element.className === 'string'
      ? '.' + element.className.trim().split(/\s+/).join('.')
      : ''
  return tag + cls
}

function startClickCollection(pipeline: Pipeline<Record<string, unknown>>): () => void {
  let pendingPointerDown:
    | {
        name: string
        nameSource: string
        targetSelector: string
        targetWidth: number
        targetHeight: number
        startTime: number
        startDate: number
      }
    | undefined

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target as Element
    if (!target) return
    const { name, nameSource } = getActionName(target)
    pendingPointerDown = {
      name,
      nameSource,
      targetSelector: computeSelector(target),
      targetWidth: target.clientWidth ?? 0,
      targetHeight: target.clientHeight ?? 0,
      startTime: performance.now(),
      startDate: Date.now(),
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!pendingPointerDown) return
    const pd = pendingPointerDown
    pendingPointerDown = undefined

    const clickEvent: ClickEvent = {
      ...pd,
      positionX: event.clientX,
      positionY: event.clientY,
      pointerUpDelay: performance.now() - pd.startTime,
    }
    pipeline.publish('action:click', clickEvent)
  }

  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('pointerup', onPointerUp)

  return () => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('pointerup', onPointerUp)
    pendingPointerDown = undefined
  }
}

export { startClickCollection, computeSelector }
export type { ClickEvent }
