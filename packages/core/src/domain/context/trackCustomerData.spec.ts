import { display } from '../../tools/display'
import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import {
  BYTES_COMPUTATION_THROTTLING_DELAY,
  CUSTOMER_DATA_BYTES_LIMIT,
  createCustomerDataTracker,
  warnIfCustomerDataLimitReached,
} from './trackCustomerData'
import { CustomerDataType } from './contextConstants'

describe('trackCustomerData', () => {
  let clock: Clock
  let displaySpy: jasmine.Spy<typeof display.warn>

  beforeEach(() => {
    clock = mockClock()
    displaySpy = spyOn(display, 'warn')
  })

  afterEach(() => {
    clock.cleanup()
  })

  it('should warn if the context bytes limit is reached', () => {
    const computeBytesCountStub = jasmine
      .createSpy('computeBytesCountStub')
      .and.returnValue(CUSTOMER_DATA_BYTES_LIMIT + 1)
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, computeBytesCountStub)

    customerDataTracker.updateCustomerData({})
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })

  it('should be throttled to minimize the impact on performance', () => {
    const computeBytesCountStub = jasmine.createSpy('computeBytesCountStub').and.returnValue(1)
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, computeBytesCountStub)

    customerDataTracker.updateCustomerData({ foo: 1 }) // leading call executed synchronously
    customerDataTracker.updateCustomerData({ foo: 2 }) // ignored
    customerDataTracker.updateCustomerData({ foo: 3 }) // trailing call executed after BYTES_COMPUTATION_THROTTLING_DELAY
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(computeBytesCountStub).toHaveBeenCalledTimes(2)
  })

  it('should warn once if the context bytes limit is reached', () => {
    const computeBytesCountStub = jasmine
      .createSpy('computeBytesCountStub')
      .and.returnValue(CUSTOMER_DATA_BYTES_LIMIT + 1)
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, computeBytesCountStub)

    customerDataTracker.updateCustomerData({})
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    customerDataTracker.updateCustomerData({})
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })
})

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
