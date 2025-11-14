import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { EmitRecordCallback } from '../serialization'
import { RecordType } from '../../../types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackVisualViewportResize } from './trackViewportResize'
import type { Tracker } from './tracker.types'

describe('trackViewportResize', () => {
  let viewportResizeTracker: Tracker
  let visualViewportResizeCallback: jasmine.Spy<EmitRecordCallback>

  beforeEach(() => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }

    visualViewportResizeCallback = jasmine.createSpy()
    const scope = createSerializationScopeForTesting({ emitRecord: visualViewportResizeCallback })
    takeFullSnapshotForTesting(scope)

    viewportResizeTracker = trackVisualViewportResize(scope)
    registerCleanupTask(() => {
      viewportResizeTracker.stop()
    })
  })

  it('collects visual viewport on resize', () => {
    visualViewport!.dispatchEvent(createNewEvent('resize'))

    expect(visualViewportResizeCallback).toHaveBeenCalledOnceWith({
      type: RecordType.VisualViewport,
      timestamp: jasmine.any(Number),
      data: {
        scale: jasmine.any(Number),
        offsetLeft: jasmine.any(Number),
        offsetTop: jasmine.any(Number),
        pageLeft: jasmine.any(Number),
        pageTop: jasmine.any(Number),
        height: jasmine.any(Number),
        width: jasmine.any(Number),
      },
    })
  })

  it('collects visual viewport on scroll', () => {
    visualViewport!.dispatchEvent(createNewEvent('scroll'))

    expect(visualViewportResizeCallback).toHaveBeenCalledOnceWith({
      type: RecordType.VisualViewport,
      timestamp: jasmine.any(Number),
      data: {
        scale: jasmine.any(Number),
        offsetLeft: jasmine.any(Number),
        offsetTop: jasmine.any(Number),
        pageLeft: jasmine.any(Number),
        pageTop: jasmine.any(Number),
        height: jasmine.any(Number),
        width: jasmine.any(Number),
      },
    })
  })
})
