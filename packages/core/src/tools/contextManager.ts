import { Context, ContextValue } from './context'

export function createContextManager() {
  let context: Context = {}

  return {
    get: () => context,

    add: (key: string, value: any) => {
      context[key] = value as ContextValue
    },

    remove: (key: string) => {
      delete context[key]
    },

    set: (newContext: object) => {
      context = newContext as Context
    },
  }
}
