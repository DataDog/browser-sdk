import { noop, monitor } from '@datadog/browser-core'
import { IGNORED_NODE, INode } from '../rrweb-snapshot'
import { HookResetter, ListenerHandler, Mirror, ThrottleOptions } from './types'

export function on(type: string, fn: (event: any) => void, target: Document | Window = document): ListenerHandler {
  const monitoredFn = monitor(fn)
  const options = { capture: true, passive: true }
  target.addEventListener(type, monitoredFn, options)
  return () => target.removeEventListener(type, monitoredFn, options)
}

export const mirror: Mirror = {
  map: {},
  getId(n) {
    // if n is not a serialized INode, use -1 as its id.
    // eslint-disable-next-line no-underscore-dangle
    if (!n.__sn) {
      return -1
    }
    return n.__sn.id // eslint-disable-line no-underscore-dangle
  },
  getNode(id) {
    return mirror.map[id] || null
  },
  // TODO: use a weakmap to get rid of manually memory management
  removeNodeFromMap(n) {
    const id = n.__sn && n.__sn.id // eslint-disable-line no-underscore-dangle
    delete mirror.map[id]
    if (n.childNodes) {
      forEach(n.childNodes, (child: ChildNode) => mirror.removeNodeFromMap((child as Node) as INode))
    }
  },
  has(id) {
    return mirror.map.hasOwnProperty(id)
  },
}

// copy from underscore and modified
export function throttle<T>(func: (arg: T) => void, wait: number, options: ThrottleOptions = {}) {
  let timeout: number | undefined
  let previous = 0
  return function (this: unknown) {
    const now = Date.now()
    if (!previous && options.leading === false) {
      previous = now
    }
    const remaining = wait - (now - previous)
    const args = (arguments as unknown) as [T]
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
      }
      previous = now
      func.apply(this, args)
    } else if (!timeout && options.trailing !== false) {
      timeout = setTimeout(() => {
        previous = options.leading === false ? 0 : Date.now()
        timeout = undefined
        func.apply(this, args)
      }, remaining)
    }
  }
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

// eslint-disable-next-line max-len
// copy from https://github.com/getsentry/sentry-javascript/blob/b2109071975af8bf0316d3b5b38f519bdaf5dc15/packages/utils/src/object.ts
export function patch(
  source: { [key: string]: any },
  name: string,
  replacement: (...args: any[]) => unknown
): () => void {
  try {
    if (!(name in source)) {
      return noop
    }

    const original = source[name] as () => unknown
    const wrapped = replacement(original)

    // Make sure it's a function first, as we need to attach an empty prototype for `defineProperties` to work
    // otherwise it'll throw "TypeError: Object.defineProperties called on non-object"
    if (typeof wrapped === 'function') {
      wrapped.prototype = wrapped.prototype || {}
      Object.defineProperties(wrapped, {
        __rrweb_original__: {
          enumerable: false,
          value: original,
        },
      })
    }

    source[name] = wrapped

    return () => {
      source[name] = original
    }
  } catch {
    return noop
    // This can throw if multiple fill happens on a global object like XMLHttpRequest
    // Fixes https://github.com/getsentry/sentry-javascript/issues/2043
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

export function isIgnored(n: Node | INode): boolean {
  if ('__sn' in n) {
    return n.__sn.id === IGNORED_NODE // eslint-disable-line no-underscore-dangle
  }
  // The main part of the slimDOM check happens in
  // rrweb-snapshot::serializeNodeWithId
  return false
}

export function isAncestorRemoved(target: INode): boolean {
  const id = mirror.getId(target)
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
  return isAncestorRemoved((target.parentNode as unknown) as INode)
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
