import { deepClone } from './utils'

import type { Context, ContextValue } from './context'

export function createContextManager() {
  let context: Context = {}

  return {
    /** @deprecated use getContext instead */
    get: () => context,

    /** @deprecated use setContextProperty instead */
    add: (key: string, value: any) => {
      context[key] = value as ContextValue
    },

    /** @deprecated renamed to removeContextProperty */
    remove: (key: string) => {
      delete context[key]
    },

    /** @deprecated use setContext instead */
    set: (newContext: object) => {
      context = newContext as Context
    },

    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      context = deepClone(newContext)
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = deepClone(property)
    },

    removeContextProperty: (key: string) => {
      delete context[key]
    },

    clearContext: () => {
      context = {}
    },
  }
}
