import { mockEndpointBuilder } from '../../test'
import type { PageExitEvent } from '../browser/pageExitObservable'
import type { Configuration } from '../domain/configuration'
import type { RawError } from '../domain/error/error.types'
import { createIdentityEncoder } from '../tools/encoder'
import { Observable } from '../tools/observable'
import { noop } from '../tools/utils/functionUtils'
import type { batchFactory } from './batch'
import type { FlushController } from './flushController'
import type { BatchConfiguration } from './startBatchWithReplica'
import { startBatchWithReplica } from './startBatchWithReplica'

describe('startBatchWithReplica', () => {
  const DEFAULT_CONFIGURATION: Configuration = {} as Configuration
  const reportError: (error: RawError) => void = noop
  let pageExitObservable: Observable<PageExitEvent>
  let sessionExpireObservable: Observable<void>
  let batchConfiguration: BatchConfiguration
  let batchFactoryAddSpy: jasmine.Spy
  let batchFactoryUpsertSpy: jasmine.Spy
  let batchFactoryFakeImpl: typeof batchFactory

  beforeEach(() => {
    pageExitObservable = new Observable()
    sessionExpireObservable = new Observable()
    batchConfiguration = {
      endpoint: mockEndpointBuilder('https://example.com'),
      encoder: createIdentityEncoder(),
    }

    batchFactoryAddSpy = jasmine.createSpy()
    batchFactoryUpsertSpy = jasmine.createSpy()
    batchFactoryFakeImpl = () => ({
      flushController: {} as FlushController,
      add: batchFactoryAddSpy,
      upsert: batchFactoryUpsertSpy,
      stop: noop,
    })
  })

  it('adds a message to a batch and its replica', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      batchConfiguration,
      reportError,
      pageExitObservable,
      sessionExpireObservable,
      batchFactoryFakeImpl
    )

    batch.add({ foo: true })
    expect(batchFactoryAddSpy.calls.thisFor(0)).not.toBe(batchFactoryAddSpy.calls.thisFor(1))
    expect(batchFactoryAddSpy).toHaveBeenCalledTimes(2)
    expect(batchFactoryAddSpy.calls.argsFor(0)).toEqual([{ foo: true }])
    expect(batchFactoryAddSpy.calls.argsFor(1)).toEqual([{ foo: true }])
  })

  it('does not add a message to the replica if no replica is specified', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      undefined,
      reportError,
      pageExitObservable,
      sessionExpireObservable,
      batchFactoryFakeImpl
    )

    batch.add({ foo: true })
    expect(batchFactoryAddSpy).toHaveBeenCalledTimes(1)
  })

  it("does not add a message to the replica if it shouldn't be replicated", () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      batchConfiguration,
      reportError,
      pageExitObservable,
      sessionExpireObservable,
      batchFactoryFakeImpl
    )

    batch.add({ foo: true }, false)
    expect(batchFactoryAddSpy).toHaveBeenCalledTimes(1)
  })

  it('upserts a message to a batch and its replica', () => {
    const batch = startBatchWithReplica(
      DEFAULT_CONFIGURATION,
      batchConfiguration,
      batchConfiguration,
      reportError,
      pageExitObservable,
      sessionExpireObservable,
      batchFactoryFakeImpl
    )

    batch.upsert({ foo: true }, 'message-id')
    expect(batchFactoryUpsertSpy).toHaveBeenCalledTimes(2)
    expect(batchFactoryUpsertSpy.calls.thisFor(0)).not.toBe(batchFactoryUpsertSpy.calls.thisFor(1))
    expect(batchFactoryUpsertSpy.calls.argsFor(0)).toEqual([{ foo: true }, 'message-id'])
    expect(batchFactoryUpsertSpy.calls.argsFor(1)).toEqual([{ foo: true }, 'message-id'])
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
      sessionExpireObservable,
      batchFactoryFakeImpl
    )

    batch.add({ foo: true })
    expect(batchFactoryAddSpy.calls.argsFor(0)).toEqual([{ foo: true }])
    expect(batchFactoryAddSpy.calls.argsFor(1)).toEqual([{ foo: true, bar: true }])
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
      sessionExpireObservable,
      batchFactoryFakeImpl
    )

    batch.upsert({ foo: true }, 'message-id')
    expect(batchFactoryUpsertSpy.calls.argsFor(0)).toEqual([{ foo: true }, 'message-id'])
    expect(batchFactoryUpsertSpy.calls.argsFor(1)).toEqual([{ foo: true, bar: true }, 'message-id'])
  })
})
