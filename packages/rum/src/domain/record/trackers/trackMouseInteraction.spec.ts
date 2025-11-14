import { DOM_EVENT } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../../../rum-core/test'
import { IncrementalSource, MouseInteractionType, RecordType } from '../../../types'
import type { EmitRecordCallback, SerializationScope } from '../serialization'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackMouseInteraction } from './trackMouseInteraction'
import type { Tracker } from './tracker.types'

describe('trackMouseInteraction', () => {
  let mouseInteractionCallbackSpy: jasmine.Spy<EmitRecordCallback>
  let mouseInteractionTracker: Tracker
  let scope: SerializationScope
  let a: HTMLAnchorElement

  beforeEach(() => {
    a = appendElement('<a tabindex="0"></a>') as HTMLAnchorElement // tabindex 0 makes the element focusable
    a.dispatchEvent(createNewEvent(DOM_EVENT.FOCUS))

    mouseInteractionCallbackSpy = jasmine.createSpy()
    scope = createSerializationScopeForTesting({ emitRecord: mouseInteractionCallbackSpy })
    takeFullSnapshotForTesting(scope)

    mouseInteractionTracker = trackMouseInteraction(scope)
    registerCleanupTask(() => {
      mouseInteractionTracker.stop()
    })
  })

  it('should generate click record', () => {
    a.dispatchEvent(createNewEvent(DOM_EVENT.CLICK, { clientX: 0, clientY: 0 }))

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Click,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('should generate mouseup record on pointerup DOM event', () => {
    const pointerupEvent = createNewEvent(DOM_EVENT.POINTER_UP, { clientX: 1, clientY: 2 })
    a.dispatchEvent(pointerupEvent)

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: scope.eventIds.getIdForEvent(pointerupEvent),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.MouseUp,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('should not generate click record if x/y are missing', () => {
    const clickEvent = createNewEvent(DOM_EVENT.CLICK)
    a.dispatchEvent(clickEvent)

    expect(mouseInteractionCallbackSpy).not.toHaveBeenCalled()
  })

  it('should generate blur record', () => {
    a.dispatchEvent(createNewEvent(DOM_EVENT.BLUR))

    expect(mouseInteractionCallbackSpy).toHaveBeenCalledWith({
      id: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MouseInteraction,
        type: MouseInteractionType.Blur,
        id: jasmine.any(Number),
      },
    })
  })

  // related to safari issue, see RUMF-1450
  describe('forced layout issue', () => {
    let coordinatesComputed: boolean

    beforeEach(() => {
      if (!window.visualViewport) {
        pending('no visualViewport')
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
      expect(coordinatesComputed).toBeTrue()
    })

    it('should not compute x/y coordinates for blur record', () => {
      a.dispatchEvent(createNewEvent(DOM_EVENT.BLUR))
      expect(coordinatesComputed).toBeFalse()
    })
  })
})
