import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { RecordType } from '../../../types'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import type { VisualViewportResizeCallback } from './trackViewportResize'
import { tackVisualViewportResize } from './trackViewportResize'
import type { Tracker } from './types'

describe('trackViewportResize', () => {
  let viewportResizeTracker: Tracker
  let visualViewportResizeCallback: jasmine.Spy<VisualViewportResizeCallback>
  let configuration: RumConfiguration
  let elementsScrollPositions: ElementsScrollPositions

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    elementsScrollPositions = createElementsScrollPositions()
    visualViewportResizeCallback = jasmine.createSpy()

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      elementsScrollPositions,
    })

    viewportResizeTracker = tackVisualViewportResize(configuration, visualViewportResizeCallback)
  })

  afterEach(() => {
    viewportResizeTracker.stop()
  })

  it('collects visual viewport on resize', () => {
    visualViewport!.dispatchEvent(createNewEvent('resize'))

    expect(visualViewportResizeCallback).toHaveBeenCalledOnceWith({
      timestamp: jasmine.any(Number),
      data: {
        height: jasmine.any(Number),
        offsetLeft: jasmine.any(Number),
        offsetTop: jasmine.any(Number),
        pageLeft: jasmine.any(Number),
        pageTop: jasmine.any(Number),
        scale: jasmine.any(Number),
        width: jasmine.any(Number),
      },
      type: RecordType.VisualViewport,
    })
  })

  it('collects visual viewport on scroll', () => {
    visualViewport!.dispatchEvent(createNewEvent('scroll'))

    expect(visualViewportResizeCallback).toHaveBeenCalledOnceWith({
      timestamp: jasmine.any(Number),
      data: {
        height: jasmine.any(Number),
        offsetLeft: jasmine.any(Number),
        offsetTop: jasmine.any(Number),
        pageLeft: jasmine.any(Number),
        pageTop: jasmine.any(Number),
        scale: jasmine.any(Number),
        width: jasmine.any(Number),
      },
      type: RecordType.VisualViewport,
    })
  })
})
