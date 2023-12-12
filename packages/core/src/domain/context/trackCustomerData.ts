import { ONE_KIBI_BYTE, computeBytesCount } from '../../tools/utils/byteUtils'
import { throttle } from '../../tools/utils/functionUtils'
import type { Context } from '../../tools/serialisation/context'
import { jsonStringify } from '../../tools/serialisation/jsonStringify'
import { display } from '../../tools/display'
import { CustomerDataType } from './contextConstants'

// RUM and logs batch bytes limit is 16KB
// ensure that we leave room for other event attributes and maintain a decent amount of event per batch
// (3KB (customer data) + 1KB (other attributes)) * 4 (events per batch) = 16KB
export const CUSTOMER_DATA_BYTES_LIMIT = 3 * ONE_KIBI_BYTE

export const BYTES_COMPUTATION_THROTTLING_DELAY = 200

export type CustomerDataTracker = ReturnType<typeof createCustomerDataTracker>

export function createCustomerDataTracker(type: CustomerDataType, computeBytesCountImpl = computeBytesCount) {
  let bytesCountCache = 0
  let alreadyWarned = false

  // Throttle the bytes computation to minimize the impact on performance.
  // Especially useful if the user call context APIs synchronously multiple times in a row
  const { throttled: computeBytesCountThrottled, cancel: cancelComputeBytesCount } = throttle((context: Context) => {
    bytesCountCache = computeBytesCountImpl(jsonStringify(context)!)
    if (!alreadyWarned) {
      alreadyWarned = warnIfCustomerDataLimitReached(bytesCountCache, type)
    }
  }, BYTES_COMPUTATION_THROTTLING_DELAY)

  return {
    type,
    updateCustomerData: computeBytesCountThrottled,
    resetCustomerData: () => {
      bytesCountCache = 0
    },
    getBytesCount: () => bytesCountCache,
    stop: () => {
      cancelComputeBytesCount()
    },
  }
}

const CustomerDataLabel = {
  [CustomerDataType.FeatureFlag]: 'feature flag evaluation',
  [CustomerDataType.User]: 'user',
  [CustomerDataType.GlobalContext]: 'global context',
  [CustomerDataType.LoggerContext]: 'logger context',
}
export function warnIfCustomerDataLimitReached(bytesCount: number, customerDataType: CustomerDataType): boolean {
  if (bytesCount > CUSTOMER_DATA_BYTES_LIMIT) {
    display.warn(
      `The ${CustomerDataLabel[customerDataType]} data exceeds the recommended ${
        CUSTOMER_DATA_BYTES_LIMIT / ONE_KIBI_BYTE
      }KiB threshold. More details: https://docs.datadoghq.com/real_user_monitoring/browser/troubleshooting/#customer-data-exceeds-the-recommended-3kib-warning`
    )
    return true
  }
  return false
}
