import { DOM_EVENT, DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { appendElement } from '../../../../../rum-core/test'
import { IncrementalSource, MouseInteractionType, RecordType } from '../../../types'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import type { RecordIds } from '../recordIds'
import { initRecordIds } from '../recordIds'
import type { MouseInteractionCallback } from './trackMouseInteraction'
import { trackMouseInteraction } from './trackMouseInteraction'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import type { Tracker } from './tracker.types'

describe('trackMouseInteraction', () => {
  let mouseInteractionCallbackSpy: jasmine.Spy<MouseInteractionCallback>
  let mouseInteractionTracker: Tracker
  let recordIds: RecordIds
  let a: HTMLAnchorElement
  let configuration: RumConfiguration

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }

    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    a = appendElement('<a tabindex="0"></a>') as HTMLAnchorElement // tabindex 0 makes the element focusable
    a.dispatchEvent(createNewEvent(DOM_EVENT.FOCUS))

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })

    mouseInteractionCallbackSpy = jasmine.createSpy()
    recordIds = initRecordIds()
    mouseInteractionTracker = trackMouseInteraction(configuration, mouseInteractionCallbackSpy, recordIds)

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
      id: recordIds.getIdForEvent(pointerupEvent),
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
