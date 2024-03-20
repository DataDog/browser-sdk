import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { RecordType } from '../../../types'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './observers.specHelper'
import type { VisualViewportResizeCallback } from './viewportResizeObserver'
import { initVisualViewportResizeObserver } from './viewportResizeObserver'

describe('initVisualViewportResizeObserver', () => {
  let stopVisualViewportResizeObserver: () => void
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
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions,
    })

    stopVisualViewportResizeObserver = initVisualViewportResizeObserver(
      configuration,
      visualViewportResizeCallback
    ).stop
  })

  afterEach(() => {
    stopVisualViewportResizeObserver()
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
