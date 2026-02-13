import { vi, type Mock } from 'vitest'
import { DOM_EVENT } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../../../rum-core/test'
import { IncrementalSource, MouseInteractionType, RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import type { RecordingScope } from '../recordingScope'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackMouseInteraction } from './trackMouseInteraction'
import type { Tracker } from './tracker.types'

describe('trackMouseInteraction', () => {
  let emitRecordCallback: Mock<EmitRecordCallback>
  let mouseInteractionTracker: Tracker
  let scope: RecordingScope
  let a: HTMLAnchorElement

  beforeEach(() => {
    a = appendElement('<a tabindex="0"></a>') as HTMLAnchorElement // tabindex 0 makes the element focusable
    a.dispatchEvent(createNewEvent(DOM_EVENT.FOCUS))

    scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    emitRecordCallback = vi.fn()
    mouseInteractionTracker = trackMouseInteraction(emitRecordCallback, scope)
    registerCleanupTask(() => {
      mouseInteractionTracker.stop()
    })
  })

  it('should generate click record', () => {
    a.dispatchEvent(createNewEvent(DOM_EVENT.CLICK, { clientX: 0, clientY: 0 }))

    expect(emitRecordCallback).toHaveBeenCalledWith({
      id: expect.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Click,
        id: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      },
    })
  })

  it('should generate mouseup record on pointerup DOM event', () => {
    const pointerupEvent = createNewEvent(DOM_EVENT.POINTER_UP, { clientX: 1, clientY: 2 })
    a.dispatchEvent(pointerupEvent)

    expect(emitRecordCallback).toHaveBeenCalledWith({
      id: scope.eventIds.getOrInsert(pointerupEvent),
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.MouseUp,
        id: expect.any(Number),
        x: expect.any(Number),
        y: expect.any(Number),
      },
    })
  })

  it('should not generate click record if x/y are missing', () => {
    const clickEvent = createNewEvent(DOM_EVENT.CLICK)
    a.dispatchEvent(clickEvent)

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })

  it('should generate blur record', () => {
    a.dispatchEvent(createNewEvent(DOM_EVENT.BLUR))

    expect(emitRecordCallback).toHaveBeenCalledWith({
      id: expect.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Blur,
        id: expect.any(Number),
      },
    })
  })

  // related to safari issue, see RUMF-1450
  describe('forced layout issue', () => {
    let coordinatesComputed: boolean

    beforeEach(() => {
      if (!window.visualViewport) {
        return // skip: 'no visualViewport'
      }

      coordinatesComputed = false
      Object.defineProperty(window.visualViewport, 'offsetTop', {
        get() {
          coordinatesComputed = true
          return 0
        },
        configurable: true,
      })
    })

    afterEach(() => {
      if (!window.visualViewport) {
        return
      }

      delete (window.visualViewport as any).offsetTop
    })

    it('should compute x/y coordinates for click record', () => {
      a.dispatchEvent(createNewEvent(DOM_EVENT.CLICK))
      expect(coordinatesComputed).toBe(true)
    })

    it('should not compute x/y coordinates for blur record', () => {
      a.dispatchEvent(createNewEvent(DOM_EVENT.BLUR))
      expect(coordinatesComputed).toBe(false)
    })
  })
})
