import { display } from '../../tools/display'
import { CUSTOMER_DATA_BYTES_LIMIT, warnIfCustomerDataLimitReached } from './trackCustomerData'
import { CustomerDataType } from './contextConstants'

describe('warnIfCustomerDataLimitReached', () => {
  let displaySpy: jasmine.Spy<typeof display.warn>
  beforeEach(() => {
    displaySpy = spyOn(display, 'warn')
  })

  it('should warn when the customer data reach the limit', () => {
    const warned = warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT + 1, CustomerDataType.User)
    expect(warned).toEqual(true)
    expect(displaySpy).toHaveBeenCalledWith(
      'The user data exceeds the recommended 3KiB threshold. More details: https://docs.datadoghq.com/real_user_monitoring/browser/troubleshooting/#customer-data-exceeds-the-recommended-3kib-warning'
    )
  })

  it('should not warn when the customer data does not reach the limit', () => {
    const warned = warnIfCustomerDataLimitReached(CUSTOMER_DATA_BYTES_LIMIT - 1, CustomerDataType.User)
    expect(warned).toEqual(false)
    expect(displaySpy).not.toHaveBeenCalled()
  })
})
