import { display } from '../../tools/display'
import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import {
  BYTES_COMPUTATION_THROTTLING_DELAY,
  CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT,
  CUSTOMER_DATA_BYTES_LIMIT,
  CustomerDataCompressionStatus,
  createCustomerDataTracker,
} from './customerDataTracker'
import { CustomerDataType } from './contextConstants'

const CONTEXT_OVER_LIMIT = { a: Array(CUSTOMER_DATA_BYTES_LIMIT).join('a') }
const CONTEXT_OVER_COMPRESSED_LIMIT = { a: Array(CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT).join('a') }

describe('customerDataTracker', () => {
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
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, CustomerDataCompressionStatus.Disabled)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })

  it('should use a bigger limit if the compression is enabled', () => {
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, CustomerDataCompressionStatus.Enabled)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).not.toHaveBeenCalled()

    customerDataTracker.updateCustomerData(CONTEXT_OVER_COMPRESSED_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalled()
  })

  it('should not warn until the compression status is known', () => {
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, CustomerDataCompressionStatus.Unknown)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).not.toHaveBeenCalled()

    customerDataTracker.setCompressionStatus(CustomerDataCompressionStatus.Disabled)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalled()
  })

  it('should be throttled to minimize the impact on performance', () => {
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, CustomerDataCompressionStatus.Disabled)

    customerDataTracker.updateCustomerData({ foo: 1 }) // leading call executed synchronously
    expect(customerDataTracker.getBytesCount()).toEqual(9)
    customerDataTracker.updateCustomerData({ foo: 11 }) // ignored
    expect(customerDataTracker.getBytesCount()).toEqual(9)
    customerDataTracker.updateCustomerData({ foo: 111 }) // trailing call executed after BYTES_COMPUTATION_THROTTLING_DELAY
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    expect(customerDataTracker.getBytesCount()).toEqual(11)
  })

  it('should warn once if the context bytes limit is reached', () => {
    const customerDataTracker = createCustomerDataTracker(CustomerDataType.User, CustomerDataCompressionStatus.Disabled)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })
})
