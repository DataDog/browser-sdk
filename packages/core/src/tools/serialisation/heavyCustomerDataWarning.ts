import { ONE_KIBI_BYTE } from '../utils/byteUtils'
import { display } from '../display'

// RUM and logs batch bytes limit is 16KB
// ensure that we leave room for other event attributes and maintain a decent amount of event per batch
// (3KB (customer data) + 1KB (other attributes)) * 4 (events per batch) = 16KB
export const CUSTOMER_DATA_BYTES_LIMIT = 3 * ONE_KIBI_BYTE

export const enum CustomerDataType {
  FeatureFlag = 'feature flag evaluation',
  User = 'user',
  GlobalContext = 'global context',
  LoggerContext = 'logger context',
}

export function warnIfCustomerDataLimitReached(bytesCount: number, customerDataType: CustomerDataType): boolean {
  if (bytesCount > CUSTOMER_DATA_BYTES_LIMIT) {
    display.warn(
      `The ${customerDataType} data is over ${
        CUSTOMER_DATA_BYTES_LIMIT / ONE_KIBI_BYTE
      }KiB. On low connectivity, the SDK has the potential to exhaust the user's upload bandwidth.`
    )
    return true
  }
  return false
}
