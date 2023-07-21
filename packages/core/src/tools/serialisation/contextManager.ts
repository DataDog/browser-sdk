import { computeBytesCount } from '../utils/byteUtils'
import { throttle } from '../utils/functionUtils'
import { deepClone } from '../mergeInto'
import { getType } from '../utils/typeUtils'
import { jsonStringify } from './jsonStringify'
import { sanitize } from './sanitize'
import { warnIfCustomerDataLimitReached } from './heavyCustomerDataWarning'
import type { CustomerDataType } from './heavyCustomerDataWarning'
import type { Context } from './context'

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

  const contextManager = {
    getBytesCount: () => bytesCountCache,

    getContext: () => deepClone(context),

    setContext: (newContext: Context) => {
      if (getType(newContext) === 'object') {
        context = sanitize(newContext)
        computeBytesCountThrottled(context)
      } else {
        contextManager.clearContext()
      }
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
  return contextManager
}
