import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
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
      ctx.skip('visualViewport not supported')
    }

    emitRecordCallback = vi.fn()
    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    viewportResizeTracker = trackVisualViewportResize(emitRecordCallback)
    registerCleanupTask(() => {
      viewportResizeTracker.stop()
    })
  })

  it('collects visual viewport on resize', () => {
    visualViewport!.dispatchEvent(createNewEvent('resize'))

    expect(emitRecordCallback).toHaveBeenCalledExactlyOnceWith({
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

    expect(emitRecordCallback).toHaveBeenCalledExactlyOnceWith({
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

    expect(() => trackVisualViewportResize(vi.fn()).stop()).not.toThrow()
  })
})
