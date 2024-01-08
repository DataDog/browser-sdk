import { display } from '../../tools/display'
import type { Clock } from '../../../test'
import { mockClock } from '../../../test'
import {
  BYTES_COMPUTATION_THROTTLING_DELAY,
  CUSTOMER_COMPRESSED_DATA_BYTES_LIMIT,
  CUSTOMER_DATA_BYTES_LIMIT,
  CustomerDataCompressionStatus,
  createCustomerDataTrackerManager,
} from './customerDataTracker'
import { CustomerDataType } from './contextConstants'

const CONTEXT_OVER_LIMIT = { a: Array(CUSTOMER_DATA_BYTES_LIMIT).join('a') }
const CONTEXT_HALF_LIMIT = { a: Array(CUSTOMER_DATA_BYTES_LIMIT / 2).join('a') }
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
    const customerDataTracker = createCustomerDataTrackerManager(
      CustomerDataCompressionStatus.Disabled
    ).getOrCreateTracker(CustomerDataType.User)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })

  it('should take all trackers into account', () => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)

    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User).updateCustomerData(CONTEXT_HALF_LIMIT)
    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.GlobalContext).updateCustomerData(CONTEXT_HALF_LIMIT)

    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })

  it('should warn if a detached tracker plus regular trackers exceed the limit', () => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)

    customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User).updateCustomerData(CONTEXT_HALF_LIMIT)
    customerDataTrackerManager.createDetachedTracker().updateCustomerData(CONTEXT_HALF_LIMIT)

    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    expect(displaySpy).toHaveBeenCalledTimes(1)
  })

  it('should consider detached trackers independently', () => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Disabled)

    customerDataTrackerManager.createDetachedTracker().updateCustomerData(CONTEXT_HALF_LIMIT)
    customerDataTrackerManager.createDetachedTracker().updateCustomerData(CONTEXT_HALF_LIMIT)

    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    expect(displaySpy).not.toHaveBeenCalled()
  })

  it('should use a bigger limit if the compression is enabled', () => {
    const customerDataTracker = createCustomerDataTrackerManager(
      CustomerDataCompressionStatus.Enabled
    ).getOrCreateTracker(CustomerDataType.User)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).not.toHaveBeenCalled()

    customerDataTracker.updateCustomerData(CONTEXT_OVER_COMPRESSED_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalled()
  })

  it('should not warn until the compression status is known', () => {
    const customerDataTrackerManager = createCustomerDataTrackerManager(CustomerDataCompressionStatus.Unknown)
    const customerDataTracker = customerDataTrackerManager.getOrCreateTracker(CustomerDataType.User)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).not.toHaveBeenCalled()

    customerDataTrackerManager.setCompressionStatus(CustomerDataCompressionStatus.Disabled)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalled()
  })

  it('should be throttled to minimize the impact on performance', () => {
    const customerDataTracker = createCustomerDataTrackerManager(
      CustomerDataCompressionStatus.Disabled
    ).getOrCreateTracker(CustomerDataType.User)

    customerDataTracker.updateCustomerData({ foo: 1 }) // leading call executed synchronously
    expect(customerDataTracker.getBytesCount()).toEqual(9)
    customerDataTracker.updateCustomerData({ foo: 11 }) // ignored
    expect(customerDataTracker.getBytesCount()).toEqual(9)
    customerDataTracker.updateCustomerData({ foo: 111 }) // trailing call executed after BYTES_COMPUTATION_THROTTLING_DELAY
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    expect(customerDataTracker.getBytesCount()).toEqual(11)
  })

  it('should warn only once if the context bytes limit is reached', () => {
    const customerDataTracker = createCustomerDataTrackerManager(
      CustomerDataCompressionStatus.Disabled
    ).getOrCreateTracker(CustomerDataType.User)

    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)
    customerDataTracker.updateCustomerData(CONTEXT_OVER_LIMIT)
    clock.tick(BYTES_COMPUTATION_THROTTLING_DELAY)

    expect(displaySpy).toHaveBeenCalledTimes(1)
  })
})
