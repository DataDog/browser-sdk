import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import {
  serializeDocument,
  SerializationContextStatus,
  createSerializationStats,
  createSerializationScope,
} from '../serialization'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { RecordType } from '../../../types'
import { createNodeIds } from '../nodeIds'
import type { EmitRecordCallback } from '../record.types'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import { trackVisualViewportResize } from './trackViewportResize'
import type { Tracker } from './tracker.types'

describe('trackViewportResize', () => {
  let viewportResizeTracker: Tracker
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let configuration: RumConfiguration
  let elementsScrollPositions: ElementsScrollPositions

  beforeEach(() => {
    if (!window.visualViewport) {
      pending('visualViewport not supported')
    }

    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    elementsScrollPositions = createElementsScrollPositions()
    emitRecordCallback = jasmine.createSpy()

    const scope = createSerializationScope(createNodeIds())
    serializeDocument(document, DEFAULT_CONFIGURATION, scope, {
      serializationStats: createSerializationStats(),
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions,
    })

    viewportResizeTracker = trackVisualViewportResize(configuration, emitRecordCallback)

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
