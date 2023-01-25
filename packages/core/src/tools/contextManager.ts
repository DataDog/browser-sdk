import { computeBytesCount, deepClone, jsonStringify } from './utils'
import type { Context, ContextValue } from './context'
import { sanitize } from './sanitize'

export type ContextManager = ReturnType<typeof createContextManager>

export function createContextManager(computeBytesCountImpl = computeBytesCount) {
  let context: Context = {}
  let bytesCountCache: number | undefined

  return {
    getBytesCount: () => {
      if (bytesCountCache === undefined) {
        bytesCountCache = computeBytesCountImpl(jsonStringify(context)!)
      }
      return bytesCountCache
    },
    /** @deprecated use getContext instead */
    get: () => context,

    /** @deprecated use setContextProperty instead */
    add: (key: string, value: any) => {
      context[key] = value as ContextValue
      bytesCountCache = undefined
    },

    /** @deprecated renamed to removeContextProperty */
    remove: (key: string) => {
      delete context[key]
      bytesCountCache = undefined
    },

    /** @deprecated use setContext instead */
    set: (newContext: object) => {
      context = newContext as Context
      bytesCountCache = undefined
    },

    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      context = sanitize(newContext) as Context
      bytesCountCache = undefined
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = sanitize(property) as ContextValue
      bytesCountCache = undefined
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      bytesCountCache = undefined
    },

    clearContext: () => {
      context = {}
      bytesCountCache = undefined
    },
  }
}
