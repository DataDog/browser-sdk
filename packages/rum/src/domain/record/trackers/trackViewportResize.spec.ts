import { DefaultPrivacyLevel } from '@flashcatcloud/browser-core'
import { createNewEvent, registerCleanupTask } from '@flashcatcloud/browser-core/test'
import type { RumConfiguration } from '@flashcatcloud/browser-rum-core'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { RecordType } from '../../../types'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import type { VisualViewportResizeCallback } from './trackViewportResize'
import { trackVisualViewportResize } from './trackViewportResize'
import type { Tracker } from './tracker.types'

describe('trackViewportResize', () => {
  let viewportResizeTracker: Tracker
  let visualViewportResizeCallback: jasmine.Spy<VisualViewportResizeCallback>
  let configuration: RumConfiguration
  let elementsScrollPositions: ElementsScrollPositions

  beforeEach(() => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }

    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    elementsScrollPositions = createElementsScrollPositions()
    visualViewportResizeCallback = jasmine.createSpy()

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions,
    })

    viewportResizeTracker = trackVisualViewportResize(configuration, visualViewportResizeCallback)

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
