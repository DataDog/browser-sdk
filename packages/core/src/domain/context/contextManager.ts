import { computeBytesCount } from '../../tools/utils/byteUtils'
import { throttle } from '../../tools/utils/functionUtils'
import { deepClone } from '../../tools/mergeInto'
import { getType } from '../../tools/utils/typeUtils'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import { sanitize } from '../../tools/serialisation/sanitize'
import type { Context, ContextValue } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import { warnIfCustomerDataLimitReached } from './heavyCustomerDataWarning'
import type { CustomerDataType } from './contextConstants'

export const BYTES_COMPUTATION_THROTTLING_DELAY = 200

export type ContextManager = ReturnType<typeof createContextManager>

export function createContextManager(customerDataType: CustomerDataType, computeBytesCountImpl = computeBytesCount) {
  let context: Context = {}
  let bytesCountCache: number
  let alreadyWarned = false
  const changeObservable = new Observable<void>()

  // Throttle the bytes computation to minimize the impact on performance.
  // Especially useful if the user call context APIs synchronously multiple times in a row
  const { throttled: computeBytesCountThrottled } = throttle((context: Context) => {
    bytesCountCache = computeBytesCountImpl(jsonStringify(context)!)
    if (!alreadyWarned) {
      alreadyWarned = warnIfCustomerDataLimitReached(bytesCountCache, customerDataType)
    }
  }, BYTES_COMPUTATION_THROTTLING_DELAY)

  const contextManager = {
    getBytesCount: () => bytesCountCache,
    /** @deprecated use getContext instead */
    get: () => context,

    /** @deprecated use setContextProperty instead */
    add: (key: string, value: any) => {
      context[key] = value as ContextValue
      computeBytesCountThrottled(context)
      changeObservable.notify()
    },

    /** @deprecated renamed to removeContextProperty */
    remove: (key: string) => {
      delete context[key]
      computeBytesCountThrottled(context)
      changeObservable.notify()
    },

    /** @deprecated use setContext instead */
    set: (newContext: object) => {
      context = newContext as Context
      computeBytesCountThrottled(context)
      changeObservable.notify()
    },

    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      if (getType(newContext) === 'object') {
        context = sanitize(newContext)
        computeBytesCountThrottled(context)
      } else {
        contextManager.clearContext()
      }
      changeObservable.notify()
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = sanitize(property)
      computeBytesCountThrottled(context)
      changeObservable.notify()
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      computeBytesCountThrottled(context)
      changeObservable.notify()
    },

    clearContext: () => {
      context = {}
      bytesCountCache = 0
      changeObservable.notify()
    },

    changeObservable,
  }
  return contextManager
}
