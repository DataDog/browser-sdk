import { display } from './display'
import { ONE_KIBI_BYTE } from './utils'

export const CUSTOMER_DATA_BYTES_LIMIT = 3 * ONE_KIBI_BYTE

export const enum CustomerDataType {
  FeatureFlag = 'feature flag evaluation',
  User = 'user',
  GlobalContext = 'global context',
  LoggerContext = 'logger context',
}

export function warnIfCustomerDataLimitReached(bytesCount: number, customerDataType: CustomerDataType) {
  if (bytesCount > CUSTOMER_DATA_BYTES_LIMIT) {
    display.warn(
      `The ${customerDataType} data is over ${
        CUSTOMER_DATA_BYTES_LIMIT / ONE_KIBI_BYTE
      }KiB. On low connectivity, the SDK has the potential to exhaust the user's upload bandwidth.`
    )
  }
}
