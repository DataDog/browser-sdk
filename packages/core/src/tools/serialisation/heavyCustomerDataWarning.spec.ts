import { display } from '../display'
import { CustomerDataType, CUSTOMER_DATA_BYTES_LIMIT, warnIfCustomerDataLimitReached } from './heavyCustomerDataWarning'

describe('warnIfCustomerDataLimitReached', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    displaySpy = spyOn(display, 'warn')
  })

  it('should warn when the customer data reach the limit', () => {
    const warned = warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.User)
    expect(warned).toEqual(true)
    expect(displaySpy).toHaveBeenCalledWith(
      "The user data is over 3KiB. On low connectivity, the SDK has the potential to exhaust the user's upload bandwidth."
    )
  })

  it('should not warn when the customer data does not reach the limit', () => {
    const warned = warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT - 1, CustomerDataType.User)
    expect(warned).toEqual(false)
    expect(displaySpy).not.toHaveBeenCalled()
  })
})
