import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackVisualViewportResize } from './trackViewportResize'
import type { Tracker } from './tracker.types'

describe('trackViewportResize', () => {
  let viewportResizeTracker: Tracker
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>

  beforeEach(() => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }

    emitRecordCallback = jasmine.createSpy()
    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    viewportResizeTracker = trackVisualViewportResize(emitRecordCallback)
    registerCleanupTask(() => {
      viewportResizeTracker.stop()
    })
  })

  it('collects visual viewport on resize', () => {
    visualViewport!.dispatchEvent(createNewEvent('resize'))

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
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

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
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

describe('trackVisualViewportResize with a visualViewport that is not an EventTarget', () => {
  it('does not throw', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
    Object.defineProperty(window, 'visualViewport', { value: { width: 100, height: 100 }, configurable: true })
    registerCleanupTask(() => {
      if (originalDescriptor) {
        Object.defineProperty(window, 'visualViewport', originalDescriptor)
      } else {
        delete (window as { visualViewport?: unknown }).visualViewport
      }
    })

    expect(() => trackVisualViewportResize(jasmine.createSpy()).stop()).not.toThrow()
  })
})
