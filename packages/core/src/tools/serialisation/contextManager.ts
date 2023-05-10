import { computeBytesCount } from '../utils/byteUtils'
import { throttle } from '../utils/functionUtils'
import { deepClone } from '../mergeInto'
import { jsonStringify } from './jsonStringify'
import { sanitize } from './sanitize'
import { warnIfCustomerDataLimitReached } from './heavyCustomerDataWarning'
import type { CustomerDataType } from './heavyCustomerDataWarning'
import type { Context, ContextValue } from './context'

export const BYTES_COMPUTATION_THROTTLING_DELAY = 200

export type ContextManager = ReturnType<typeof createContextManager>

export function createContextManager(customerDataType: CustomerDataType, computeBytesCountImpl = computeBytesCount) {
  let context: Context = {}
  let bytesCountCache: number
  let alreadyWarned = false

  // Throttle the bytes computation to minimize the impact on performance.
  // Especially useful if the user call context APIs synchronously multiple times in a row
  const { throttled: computeBytesCountThrottled } = throttle((context: Context) => {
    bytesCountCache = computeBytesCountImpl(jsonStringify(context)!)
    if (!alreadyWarned) {
      alreadyWarned = warnIfCustomerDataLimitReached(bytesCountCache, customerDataType)
    }
  }, BYTES_COMPUTATION_THROTTLING_DELAY)

  return {
    getBytesCount: () => bytesCountCache,
    /** @deprecated use getContext instead */
    get: () => context,

    /** @deprecated use setContextProperty instead */
    add: (key: string, value: any) => {
      context[key] = value as ContextValue
      computeBytesCountThrottled(context)
    },

    /** @deprecated renamed to removeContextProperty */
    remove: (key: string) => {
      delete context[key]
      computeBytesCountThrottled(context)
    },

    /** @deprecated use setContext instead */
    set: (newContext: object) => {
      context = newContext as Context
      computeBytesCountThrottled(context)
    },

    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      context = sanitize(newContext)
      computeBytesCountThrottled(context)
    },

    setContextProperty: (key: string, property: any) => {
      context[key] = sanitize(property)
      computeBytesCountThrottled(context)
    },

    removeContextProperty: (key: string) => {
      delete context[key]
      computeBytesCountThrottled(context)
    },

    clearContext: () => {
      context = {}
      bytesCountCache = 0
    },
  }
}
