import { mockEndpointBuilder } from '../../test'
import type { PageExitEvent } from '../browser/pageExitObservable'
import type { Configuration } from '../domain/configuration'
import type { RawError } from '../domain/error/error.types'
import { createIdentityEncoder } from '../tools/encoder'
import { Observable } from '../tools/observable'
import { noop } from '../tools/utils/functionUtils'
import type { BatchConfiguration } from './startBatchWithReplica'
import { startBatchWithReplica } from './startBatchWithReplica'

describe('startBatchWithReplica', () => {
  const DEFAULT_CONFIGURATION: Configuration = {} as Configuration
  const reportError: (error: RawError) => void = noop
  let pageExitObservable: Observable<PageExitEvent>
  let sessionExpireObservable: Observable<void>
  let batchConfiguration: BatchConfiguration

  beforeEach(() => {
    pageExitObservable = new Observable()
    sessionExpireObservable = new Observable()
    batchConfiguration = {
      endpoint: mockEndpointBuilder('https://example.com'),
      encoder: createIdentityEncoder(),
    }
  })

  it('adds a message to a batch and its replica', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      batchConfiguration,
      reportError,
      pageExitObservable,
      sessionExpireObservable
    )
    const batchAddSpy = spyOn(batch, 'add')

    batch.add({ foo: true })
    expect(batchAddSpy.calls.thisFor(0)).not.toBe(batchAddSpy.calls.thisFor(1))
    expect(batchAddSpy).toHaveBeenCalledTimes(2)
    expect(batchAddSpy.calls.argsFor(0)).toEqual([{ foo: true }])
    expect(batchAddSpy.calls.argsFor(1)).toEqual([{ foo: true }])
  })

  it('does not add a message to the replica if no replica is specified', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      undefined,
      reportError,
      pageExitObservable,
      sessionExpireObservable
    )
    const batchAddSpy = spyOn(batch, 'add')

    batch.add({ foo: true })
    expect(batchAddSpy).toHaveBeenCalledTimes(1)
  })

  it("does not add a message to the replica if it shouldn't be replicated", () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      batchConfiguration,
      reportError,
      pageExitObservable,
      sessionExpireObservable
    )
    const batchAddSpy = spyOn(batch, 'add')

    batch.add({ foo: true }, false)
    expect(batchAddSpy).toHaveBeenCalledTimes(1)
  })

  it('upserts a message to a batch and its replica', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      batchConfiguration,
      reportError,
      pageExitObservable,
      sessionExpireObservable
    )
    const batchUpsertSpy = spyOn(batch, 'upsert')

    batch.upsert({ foo: true }, 'message-id')
    expect(batchUpsertSpy).toHaveBeenCalledTimes(2)
    expect(batchUpsertSpy.calls.thisFor(0)).not.toBe(batchUpsertSpy.calls.thisFor(1))
    expect(batchUpsertSpy.calls.argsFor(0)).toEqual([{ foo: true }, 'message-id'])
    expect(batchUpsertSpy.calls.argsFor(1)).toEqual([{ foo: true }, 'message-id'])
  })

  it('transforms a message when adding it to the replica', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      {
        ...batchConfiguration,
        transformMessage: (message) => ({ ...message, bar: true }),
      },
      reportError,
      pageExitObservable,
      sessionExpireObservable
    )
    const batchAddSpy = spyOn(batch, 'add')

    batch.add({ foo: true })
    expect(batchAddSpy.calls.argsFor(0)).toEqual([{ foo: true }])
    expect(batchAddSpy.calls.argsFor(1)).toEqual([{ foo: true, bar: true }])
  })

  it('transforms a message when upserting it to the replica', () => {
    const batch = startBatchWithReplica<{ foo?: boolean; bar?: boolean }>(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      {
        ...batchConfiguration,
        transformMessage: (message) => ({ ...message, bar: true }),
      },
      reportError,
      pageExitObservable,
      sessionExpireObservable
    )
    const batchUpsertSpy = spyOn(batch, 'upsert')

    batch.upsert({ foo: true }, 'message-id')
    expect(batchUpsertSpy.calls.argsFor(0)).toEqual([{ foo: true }, 'message-id'])
    expect(batchUpsertSpy.calls.argsFor(1)).toEqual([{ foo: true, bar: true }, 'message-id'])
  })
})
