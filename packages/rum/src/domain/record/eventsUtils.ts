import { isNodeShadowHost } from '@datadog/browser-rum-core'

export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches)
}

export function getEventTarget(event: Event): Node {
  if (event.composed === true && isNodeShadowHost(event.target as Node)) {
    return event.composedPath()[0] as Node
  }
  return event.target as Node
}
