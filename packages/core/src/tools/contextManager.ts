import { deepClone } from './utils'

import type { Context } from './context'

export function createContextManager() {
  let context: Context = {}

  return {
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
