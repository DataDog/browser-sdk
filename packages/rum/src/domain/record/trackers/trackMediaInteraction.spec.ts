import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { appendElement } from '../../../../../rum-core/test'
import { serializeDocument, SerializationContextStatus } from '../serialization'
import { createElementsScrollPositions } from '../elementsScrollPositions'
import { IncrementalSource, MediaInteractionType, RecordType } from '../../../types'
import type { InputCallback } from './trackInput'
import { DEFAULT_CONFIGURATION, DEFAULT_SHADOW_ROOT_CONTROLLER } from './trackers.specHelper'
import { trackMediaInteraction } from './trackMediaInteraction'
import type { Tracker } from './types'

describe('trackMediaInteraction', () => {
  let mediaInteractionTracker: Tracker
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
      status: SerializationContextStatus.INITIAL_FULL_SNAPSHOT,
      shadowRootsController: DEFAULT_SHADOW_ROOT_CONTROLLER,
      elementsScrollPositions: createElementsScrollPositions(),
    })
    mediaInteractionTracker = trackMediaInteraction(configuration, mediaInteractionCallback)
  })

  afterEach(() => {
    mediaInteractionTracker.stop()
  })

  it('collects play interactions', () => {
    audio.dispatchEvent(createNewEvent('play', { target: audio }))

    expect(mediaInteractionCallback).toHaveBeenCalledOnceWith({
      timestamp: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.MediaInteraction,
        type: MediaInteractionType.Play,
        id: jasmine.any(Number) as unknown as number,
      },
    })
  })

  it('collects pause interactions', () => {
    audio.dispatchEvent(createNewEvent('pause', { target: audio }))

    expect(mediaInteractionCallback).toHaveBeenCalledOnceWith({
      timestamp: jasmine.any(Number),
      type: RecordType.IncrementalSnapshot,
      data: {
        source: IncrementalSource.MediaInteraction,
        type: MediaInteractionType.Pause,
        id: jasmine.any(Number) as unknown as number,
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
