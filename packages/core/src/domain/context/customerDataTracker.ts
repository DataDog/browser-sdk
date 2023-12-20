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

// We observed that the compression ratio is around 8 in general, but we also want to keep a margin
// because some data might not be compressed (ex: last view update on page exit). We chose 16KiB
// because it is also the limit of the 'batchBytesCount' that we use for RUM and Logs data, but this
// is a bit arbitrary.
export const CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT = 16 * ONE_KIBI_BYTE

export const BYTES_COMPUTATION_THROTTLING_DELAY = 200

export type CustomerDataTracker = ReturnType<typeof createCustomerDataTracker>
export const enum CustomerDataCompressionStatus {
  Unknown,
  Enabled,
  Disabled,
}

export function createCustomerDataTracker(
  type: CustomerDataType,
  compressionStatus = CustomerDataCompressionStatus.Disabled
) {
  let bytesCountCache = 0
  let alreadyWarned = false

  // Throttle the bytes computation to minimize the impact on performance.
  // Especially useful if the user call context APIs synchronously multiple times in a row
  const { throttled: computeBytesCountThrottled, cancel: cancelComputeBytesCount } = throttle((context: Context) => {
    bytesCountCache = computeBytesCount(jsonStringify(context)!)
    maybeWarn()
  }, BYTES_COMPUTATION_THROTTLING_DELAY)

  function maybeWarn() {
    if (alreadyWarned || compressionStatus === CustomerDataCompressionStatus.Unknown) {
      return
    }

    const bytesCountLimit =
      compressionStatus === CustomerDataCompressionStatus.Disabled
        ? CUSTOMER_DATA_BYTES_LIMIT
        : CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT

    if (bytesCountCache > bytesCountLimit) {
      displayCustomerDataLimitReachedWarning(type, bytesCountLimit)
      alreadyWarned = true
    }
  }

  return {
    type,
    updateCustomerData: computeBytesCountThrottled,
    resetCustomerData: () => {
      bytesCountCache = 0
    },
    getBytesCount: () => bytesCountCache,
    getCompressionStatus() {
      return compressionStatus
    },
    setCompressionStatus: (newCompressionStatus: CustomerDataCompressionStatus) => {
      if (compressionStatus === CustomerDataCompressionStatus.Unknown) {
        compressionStatus = newCompressionStatus
        maybeWarn()
      }
    },
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

function displayCustomerDataLimitReachedWarning(customerDataType: CustomerDataType, bytesCountLimit: number) {
  display.warn(
    `The ${CustomerDataLabel[customerDataType]} data exceeds the recommended ${
      bytesCountLimit / ONE_KIBI_BYTE
    }KiB threshold. More details: https://docs.datadoghq.com/real_user_monitoring/browser/troubleshooting/#customer-data-exceeds-the-recommended-3kib-warning`
  )
}
