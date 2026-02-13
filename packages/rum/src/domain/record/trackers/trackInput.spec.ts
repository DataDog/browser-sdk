import { vi, type Mock } from 'vitest'
import { DefaultPrivacyLevel } from '@datadog/browser-core'
import type { Clock } from '@datadog/browser-core/test'
import { createNewEvent, mockClock, registerCleanupTask } from '@datadog/browser-core/test'
import { PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT } from '@datadog/browser-rum-core'
import { appendElement } from '../../../../../rum-core/test'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import type { BrowserIncrementalSnapshotRecord, InputData } from '../../../types'
import { IncrementalSource, RecordType } from '../../../types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackInput } from './trackInput'
import type { Tracker } from './tracker.types'

describe('trackInput', () => {
  let inputTracker: Tracker
  let emitRecordCallback: Mock<EmitRecordCallback>
  let input: HTMLInputElement
  let clock: Clock | undefined
  let scope: RecordingScope

  beforeEach(() => {
    input = appendElement('<div><input target /></div>') as HTMLInputElement

    emitRecordCallback = vi.fn()
    scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    registerCleanupTask(() => {
      inputTracker.stop()
    })
  })

  function getLatestInputPayload(): InputData & { text?: string } {
    const latestRecord = emitRecordCallback.mock.lastCall?.[0] as BrowserIncrementalSnapshotRecord
    return latestRecord.data as InputData
  }

  it('collects input values when an "input" event is dispatched', () => {
    inputTracker = trackInput(document, emitRecordCallback, scope)
    dispatchInputEvent('foo')

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.Input,
        text: 'foo',
        id: expect.any(Number) as unknown as number,
      },
    })
  })

  it('collects input values when a property setter is used', () => {
    clock = mockClock()
    inputTracker = trackInput(document, emitRecordCallback, scope)
    input.value = 'foo'

    clock.tick(0)

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.Input,
        text: 'foo',
        id: expect.any(Number) as unknown as number,
      },
    })
  })

  it('does not invoke callback when the value does not change', () => {
    clock = mockClock()
    inputTracker = trackInput(document, emitRecordCallback, scope)
    input.value = 'foo'
    clock.tick(0)

    dispatchInputEvent('foo')

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
  })

  it('does not instrument setters when observing a shadow DOM', () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const originalSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })

    inputTracker = trackInput(host.shadowRoot!, emitRecordCallback, scope)

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set).toBe(originalSetter)
  })

  // cannot trigger an event in a Shadow DOM because event with `isTrusted:false` do not cross the root
  it('collects input values when an "input" event is composed', () => {
    inputTracker = trackInput(document, emitRecordCallback, scope)
    dispatchInputEventWithInShadowDom('foo')

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.Input,
        text: 'foo',
        id: expect.any(Number) as unknown as number,
      },
    })
  })

  it('masks input values according to the element privacy level', () => {
    inputTracker = trackInput(document, emitRecordCallback, scope)
    input.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect(getLatestInputPayload().text).toBe('***')
  })

  it('masks input values according to a parent element privacy level', () => {
    inputTracker = trackInput(document, emitRecordCallback, scope)
    input.parentElement!.setAttribute(PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT)

    dispatchInputEvent('foo')

    expect(getLatestInputPayload().text).toBe('***')
  })

  it('masks input values according to a the default privacy level', () => {
    scope.configuration.defaultPrivacyLevel = DefaultPrivacyLevel.MASK
    inputTracker = trackInput(document, emitRecordCallback, scope)

    dispatchInputEvent('foo')

    expect(getLatestInputPayload().text).toBe('***')
  })

  function dispatchInputEvent(newValue: string) {
    input.value = newValue
    input.dispatchEvent(createNewEvent('input', { target: input }))
  }

  function dispatchInputEventWithInShadowDom(newValue: string) {
    input.value = newValue
    const host = document.createElement('div')
    host.attachShadow({ mode: 'open' })
    const event = createNewEvent('input', { target: host, composed: true })
    event.composedPath = () => [input, host, input.parentElement!, document.body]
    input.dispatchEvent(event)
  }
})
