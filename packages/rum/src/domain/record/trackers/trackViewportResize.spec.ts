import { vi, type Mock } from 'vitest'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackVisualViewportResize } from './trackViewportResize'
import type { Tracker } from './tracker.types'

describe('trackViewportResize', () => {
  let viewportResizeTracker: Tracker
  let emitRecordCallback: Mock<EmitRecordCallback>

  beforeEach((ctx) => {
    if (!window.visualViewport) {
      ctx.skip()
      return
    }

    emitRecordCallback = vi.fn()
    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    viewportResizeTracker = trackVisualViewportResize(emitRecordCallback, scope)
    registerCleanupTask(() => {
      viewportResizeTracker.stop()
    })
  })

  it('collects visual viewport on resize', () => {
    visualViewport!.dispatchEvent(createNewEvent('resize'))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.VisualViewport,
      timestamp: expect.any(Number),
      data: {
        scale: expect.any(Number),
        offsetLeft: expect.any(Number),
        offsetTop: expect.any(Number),
        pageLeft: expect.any(Number),
        pageTop: expect.any(Number),
        height: expect.any(Number),
        width: expect.any(Number),
      },
    })
  })

  it('collects visual viewport on scroll', () => {
    visualViewport!.dispatchEvent(createNewEvent('scroll'))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.VisualViewport,
      timestamp: expect.any(Number),
      data: {
        scale: expect.any(Number),
        offsetLeft: expect.any(Number),
        offsetTop: expect.any(Number),
        pageLeft: expect.any(Number),
        pageTop: expect.any(Number),
        height: expect.any(Number),
        width: expect.any(Number),
      },
    })
  })
})
