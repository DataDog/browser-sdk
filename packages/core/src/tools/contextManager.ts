import { Context, ContextValue } from './utils'

export function createContextManager() {
  let context: Context = {}

  return {
    get() {
      return context
    },

    add(key: string, value: ContextValue) {
      context[key] = value
    },

    remove(key: string) {
      delete context[key]
    },

    set(newContext: Context) {
      context = newContext
    },
  }
}
