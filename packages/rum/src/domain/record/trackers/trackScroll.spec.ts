import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { appendElement } from '../../../../../rum-core/test'
import {
  serializeDocument,
  SerializationContextStatus,
  createSerializationStats,
  createSerializationScope,
} from '../serialization'
import type { ElementsScrollPositions } from '../elementsScrollPositions'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { IncrementalSource, RecordType } from '../../../types'
import { createNodeIds } from '../nodeIds'
import type { InputCallback } from './trackInput'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import { trackScroll } from './trackScroll'
import type { Tracker } from './tracker.types'

describe('trackScroll', () => {
  let scrollTracker: Tracker
  let scrollCallback: jasmine.Spy<InputCallback>
  let div: HTMLDivElement
  let configuration: RumConfiguration
  let elementsScrollPositions: ElementsScrollPositions

  beforeEach(() => {
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    elementsScrollPositions = createElementsScrollPositions()
    scrollCallback = jasmine.createSpy()

    div = appendElement('<div target></div>') as HTMLDivElement

    const scope = createSerializationScope(createNodeIds())
    serializeDocument(document, DEFAULT_CONFIGURATION, scope, {
      serializationStats: createSerializationStats(),
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions,
    })
    scrollTracker = trackScroll(configuration, scope, scrollCallback, elementsScrollPositions)

    registerCleanupTask(() => {
      scrollTracker.stop()
    })
  })

  it('collects scrolls', () => {
    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(scrollCallback).toHaveBeenCalledOnceWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.Scroll,
        id: jasmine.any(Number),
        x: jasmine.any(Number),
        y: jasmine.any(Number),
      },
    })
  })

  it('do no collects scrolls if the privacy is "hidden"', () => {
    div.setAttribute('data-dd-privacy', 'hidden')

    div.dispatchEvent(createNewEvent('scroll', { target: div }))

    expect(scrollCallback).not.toHaveBeenCalled()
  })
})
