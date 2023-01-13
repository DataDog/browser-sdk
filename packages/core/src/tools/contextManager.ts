import { computeBytesCount, deepClone, isEmptyObject, jsonStringify } from './utils'
import type { Context, ContextValue } from './context'

export type ContextManager = ReturnType<typeof createContextManager>

export function createContextManager(bytesCounter = contextBytesCounter()) {
  let context: Context = {}

  return {
    getBytesCount: () => bytesCounter.compute(context),
    /** @deprecated use getContext instead */
    get: () => context,

    /** @deprecated use setContextProperty instead */
    add: (key: string, value: any) => {
      context[key] = value as ContextValue
      bytesCounter.invalidate()
    },

    /** @deprecated renamed to removeContextProperty */
    remove: (key: string) => {
      delete context[key]
      bytesCounter.invalidate()
    },

    /** @deprecated use setContext instead */
    set: (newContext: object) => {
      context = newContext as Context
      bytesCounter.invalidate()
    },

    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      context = deepClone(newContext)
      bytesCounter.invalidate()
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = deepClone(property)
      bytesCounter.invalidate()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      bytesCounter.invalidate()
    },

    clearContext: () => {
      context = {}
      bytesCounter.invalidate()
    },
  }
}

export type ContextBytesCounter = ReturnType<typeof contextBytesCounter>

export function contextBytesCounter(computeBytesCountImpl = computeBytesCount) {
  let bytesCount: number | undefined

  return {
    compute: (context: Context) => {
      if (bytesCount === undefined) {
        bytesCount = !isEmptyObject(context) ? computeBytesCountImpl(jsonStringify(context)!) : 0
      }
      return bytesCount
    },
    invalidate: () => {
      bytesCount = undefined
    },
  }
}
