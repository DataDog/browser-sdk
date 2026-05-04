import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../../../rum-core/test'
import { IncrementalSource, RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackScroll } from './trackScroll'
import type { Tracker } from './tracker.types'

describe('trackScroll', () => {
  let scrollTracker: Tracker
  let emitRecordCallback: Mock<EmitRecordCallback>
  let div: HTMLDivElement

  beforeEach(() => {
    div = appendElement('<div target></div>') as HTMLDivElement

    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    emitRecordCallback = vi.fn()
    scrollTracker = trackScroll(document, emitRecordCallback, scope)
    registerCleanupTask(() => {
      scrollTracker.stop()
    })
  })

  it('collects scrolls', () => {
    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.Scroll,
        id: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      },
    })
  })

  it('do no collects scrolls if the privacy is "hidden"', () => {
    div.setAttribute('data-dd-privacy', 'hidden')

    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })
})
