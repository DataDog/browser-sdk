import type { Clock, RequestIdleCallbackMock } from '@datadog/browser-core/test'
import { mockClock, mockRequestIdleCallback } from '@datadog/browser-core/test'
import type { MutationRecord } from '@datadog/js-core/dom'
import { MUTATION_PROCESS_MIN_DELAY, createMutationBatch } from './mutationBatch'

describe('createMutationBatch', () => {
  let mutationBatch: ReturnType<typeof createMutationBatch>
  let processMutationBatchSpy: jasmine.Spy<(mutations: MutationRecord[]) => void>
  let clock: Clock
  let requestIdleCallbackMock: RequestIdleCallbackMock

  beforeEach(() => {
    clock = mockClock()
    requestIdleCallbackMock = mockRequestIdleCallback()
    processMutationBatchSpy = jasmine.createSpy()
    mutationBatch = createMutationBatch(processMutationBatchSpy)
  })

  afterEach(() => {
    mutationBatch.stop()
  })

  it('calls the callback asynchronously after MUTATION_PROCESS_MIN_DELAY', () => {
    const mutation = { type: 'childList' } as MutationRecord
    mutationBatch.addMutations([mutation])

    expect(requestIdleCallbackMock.spy).toHaveBeenCalled()
    expect(processMutationBatchSpy).not.toHaveBeenCalled()
    requestIdleCallbackMock.idle()
    clock.tick(MUTATION_PROCESS_MIN_DELAY)
    expect(processMutationBatchSpy).toHaveBeenCalledWith([mutation])
  })

  it('calls the callback synchronously on flush', () => {
    const mutation = { type: 'childList' } as MutationRecord
    mutationBatch.addMutations([mutation])
    mutationBatch.flush()

    expect(processMutationBatchSpy).toHaveBeenCalledOnceWith([mutation])
  })

  it('appends mutations to the batch when adding more mutations', () => {
    const mutation1 = { type: 'childList' } as MutationRecord
    const mutation2 = { type: 'characterData' } as MutationRecord
    const mutation3 = { type: 'attributes' } as MutationRecord
    mutationBatch.addMutations([mutation1])
    mutationBatch.addMutations([mutation2, mutation3])
    mutationBatch.flush()

    expect(processMutationBatchSpy).toHaveBeenCalledOnceWith([mutation1, mutation2, mutation3])
  })

  it('calls the callback on flush even if there is no pending mutation', () => {
    mutationBatch.flush()

    expect(processMutationBatchSpy).toHaveBeenCalledOnceWith([])
  })
})
