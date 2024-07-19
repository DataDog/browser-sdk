import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { appendElement } from '../../../../../rum-core/test'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { IncrementalSource, MediaInteractionType, RecordType } from '../../../types'
import type { InputCallback } from './trackInput'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import { trackMediaInteraction } from './trackMediaInteraction'
import type { Tracker } from './tracker.types'

describe('trackMediaInteraction', () => {
  let stopMediaInteractionTracker: Tracker
  let mediaInteractionCallback: jasmine.Spy<InputCallback>
  let audio: HTMLAudioElement
  let configuration: RumConfiguration

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    mediaInteractionCallback = jasmine.createSpy()

    audio = appendElement('<audio controls autoplay target></audio>') as HTMLAudioElement

    serializeDocument(document, DEFAULT_CONFIGURATION, {
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      elementsScrollPositions: createElementsScrollPositions(),
    })
    stopMediaInteractionTracker = trackMediaInteraction(configuration, mediaInteractionCallback)

    registerCleanupTask(() => {
      stopMediaInteractionTracker()
    })
  })

  it('collects play interactions', () => {
    audio.dispatchEvent(createNewEvent('play', { target: audio }))

    expect(mediaInteractionCallback).toHaveBeenCalledOnceWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MediaInteraction,
        id: jasmine.any(Number) as unknown as number,
        type: MediaInteractionType.Play,
      },
    })
  })

  it('collects pause interactions', () => {
    audio.dispatchEvent(createNewEvent('pause', { target: audio }))

    expect(mediaInteractionCallback).toHaveBeenCalledOnceWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: jasmine.any(Number),
      data: {
        source: IncrementalSource.MediaInteraction,
        id: jasmine.any(Number) as unknown as number,
        type: MediaInteractionType.Pause,
      },
    })
  })

  it('do no collect media interactions if the privacy is "hidden"', () => {
    audio.setAttribute('data-dd-privacy', 'hidden')

    audio.dispatchEvent(createNewEvent('play', { target: audio }))
    audio.dispatchEvent(createNewEvent('pause', { target: audio }))

    expect(mediaInteractionCallback).not.toHaveBeenCalled()
  })
})
