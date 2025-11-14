import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../../../rum-core/test'
import type { EmitRecordCallback } from '../serialization'
import { IncrementalSource, RecordType } from '../../../types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackScroll } from './trackScroll'
import type { Tracker } from './tracker.types'

describe('trackScroll', () => {
  let scrollTracker: Tracker
  let scrollCallback: jasmine.Spy<EmitRecordCallback>
  let div: HTMLDivElement

  beforeEach(() => {
    div = appendElement('<div target></div>') as HTMLDivElement

    scrollCallback = jasmine.createSpy()
    const scope = createSerializationScopeForTesting({ emitRecord: scrollCallback })
    takeFullSnapshotForTesting(scope)

    scrollTracker = trackScroll(scope)
    registerCleanupTask(() => {
      scrollTracker.stop()
    })
  })

  it('collects scrolls', () => {
    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(scrollCallback).toHaveBeenCalledOnceWith({
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

    expect(scrollCallback).not.toHaveBeenCalled()
  })
})
