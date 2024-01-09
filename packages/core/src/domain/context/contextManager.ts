import { deepClone } from '../../tools/mergeInto'
import { getType } from '../../tools/utils/typeUtils'
import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import type { CustomerDataTracker } from './customerDataTracker'

export type ContextManager = ReturnType<typeof createContextManager>

export function createContextManager(customerDataTracker: CustomerDataTracker) {
  let context: Context = {}
  const changeObservable = new Observable<void>()

  const contextManager = {
    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      if (getType(newContext) === 'object') {
        context = sanitize(newContext)
        customerDataTracker.updateCustomerData(context)
      } else {
        contextManager.clearContext()
      }
      changeObservable.notify()
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = sanitize(property)
      customerDataTracker.updateCustomerData(context)
      changeObservable.notify()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      customerDataTracker.updateCustomerData(context)
      changeObservable.notify()
    },

    clearContext: () => {
      context = {}
      customerDataTracker.resetCustomerData()
      changeObservable.notify()
    },

    changeObservable,
  }
  return contextManager
}
