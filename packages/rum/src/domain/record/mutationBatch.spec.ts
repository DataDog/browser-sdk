import { collectAsyncCalls } from '@datadog/browser-core/test'
import { createMutationBatch } from './mutationBatch'
import type { RumMutationRecord } from './trackers'

describe('createMutationBatch', () => {
  let mutationBatch: ReturnType<typeof createMutationBatch>
  let processMutationBatchSpy: jasmine.Spy<(mutations: RumMutationRecord[]) => void>

  beforeEach(() => {
    processMutationBatchSpy = jasmine.createSpy()
    mutationBatch = createMutationBatch(processMutationBatchSpy)
  })

  afterEach(() => {
    mutationBatch.stop()
  })

  it('calls the callback asynchronously after adding a mutation', (done) => {
    const mutation = { type: 'childList' } as RumMutationRecord
    mutationBatch.addMutations([mutation])

    collectAsyncCalls(processMutationBatchSpy, 1, (calls) => {
      expect(calls.mostRecent().args[0]).toEqual([mutation])
      done()
    })
  })

  it('calls the callback synchronously on flush', () => {
    const mutation = { type: 'childList' } as RumMutationRecord
    mutationBatch.addMutations([mutation])
    mutationBatch.flush()

    expect(processMutationBatchSpy).toHaveBeenCalledOnceWith([mutation])
  })

  it('appends mutations to the batch when adding more mutations', () => {
    const mutation1 = { type: 'childList' } as RumMutationRecord
    const mutation2 = { type: 'characterData' } as RumMutationRecord
    const mutation3 = { type: 'attributes' } as RumMutationRecord
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
