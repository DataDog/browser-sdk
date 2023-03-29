import { display } from './display'
import {
  CustomerDataType,
  CUSTOMER_DATA_BYTES_LIMIT,
  resetWarnings,
  warnIfCustomerDataLimitReached,
} from './heavyCustomerDataWarning'

describe('warnIfCustomerDataLimitReached', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    displaySpy = spyOn(display, 'warn')
    resetWarnings()
  })

  it('should warn once when the customer data reach the limit', () => {
    warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.User)
    expect(displaySpy).toHaveBeenCalledWith(
      "The user data is over 3KiB. On low connectivity, the SDK has the potential to exhaust the user's upload bandwidth."
    )
  })

  it('should not warn when the customer data does not reach the limit', () => {
    warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT - 1, CustomerDataType.User)
    expect(displaySpy).not.toHaveBeenCalled()
  })

  it('should warn once per customer data types', () => {
    for (let i = 0; i < 2; i++) {
      warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.User)
      warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.FeatureFlag)
      warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.GlobalContext)
      warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.LoggerContext)
    }

    expect(displaySpy).toHaveBeenCalledTimes(4)
  })
})
