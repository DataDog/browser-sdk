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
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let div: HTMLDivElement

  beforeEach(() => {
    div = appendElement('<div target></div>') as HTMLDivElement

    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    emitRecordCallback = jasmine.createSpy()
    scrollTracker = trackScroll(document, emitRecordCallback, scope)
    registerCleanupTask(() => {
      scrollTracker.stop()
    })
  })

  it('collects scrolls', () => {
    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.Scroll,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('do no collects scrolls if the privacy is "hidden"', () => {
    div.setAttribute('data-dd-privacy', 'hidden')

    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })
})
