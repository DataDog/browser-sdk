import { getSerializedNodeId, IGNORED_NODE, INode } from '../rrweb-snapshot'
import { HookResetter, Mirror } from './types'

export const mirror: Mirror = {
  map: {},
  // TODO: use a weakmap to get rid of manually memory management
  removeNodeFromMap(n) {
    const id = getSerializedNodeId(n)
    delete mirror.map[id]
    if (n.childNodes) {
      forEach(n.childNodes, (child: ChildNode) => mirror.removeNodeFromMap((child as Node) as INode))
    }
  },
  has(id) {
    return mirror.map.hasOwnProperty(id)
  },
}

export function hookSetter<T>(
  target: T,
  key: string | number | symbol,
  d: { set(this: T, value: unknown): void }
): HookResetter {
  const original = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, {
    set(this: T, value) {
      // put hooked setter into event loop to avoid of set latency
      setTimeout(() => {
        d.set.call(this, value)
      }, 0)
      if (original && original.set) {
        original.set.call(this, value)
      }
    },
  })
  return () => {
    Object.defineProperty(target, key, original || {})
  }
}

export function getWindowHeight(): number {
  return (
    window.innerHeight ||
    (document.documentElement && document.documentElement.clientHeight) ||
    (document.body && document.body.clientHeight)
  )
}

export function getWindowWidth(): number {
  return (
    window.innerWidth ||
    (document.documentElement && document.documentElement.clientWidth) ||
    (document.body && document.body.clientWidth)
  )
}

export function isIgnored(n: Node): boolean {
  return getSerializedNodeId(n) === IGNORED_NODE
}

export function isAncestorRemoved(target: Node): boolean {
  const id = getSerializedNodeId(target)
  if (!mirror.has(id)) {
    return true
  }
  if (target.parentNode && target.parentNode.nodeType === target.DOCUMENT_NODE) {
    return false
  }
  // if the root is not document, it means the node is not in the DOM tree anymore
  if (!target.parentNode) {
    return true
  }
  return isAncestorRemoved(target.parentNode)
}

export function isTouchEvent(event: MouseEvent | TouchEvent): event is TouchEvent {
  return Boolean((event as TouchEvent).changedTouches)
}

export function forEach<List extends { [index: number]: any }>(
  list: List,
  callback: (value: List[number], index: number, parent: List) => void
) {
  Array.prototype.forEach.call(list, callback as any)
}
