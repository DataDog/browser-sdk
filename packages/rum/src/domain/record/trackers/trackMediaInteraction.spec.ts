import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../../../rum-core/test'
import type { EmitRecordCallback } from '../serialization'
import { IncrementalSource, MediaInteractionType, RecordType } from '../../../types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackMediaInteraction } from './trackMediaInteraction'
import type { Tracker } from './tracker.types'

describe('trackMediaInteraction', () => {
  let mediaInteractionTracker: Tracker
  let mediaInteractionCallback: jasmine.Spy<EmitRecordCallback>
  let audio: HTMLAudioElement

  beforeEach(() => {
    audio = appendElement('<audio controls autoplay target></audio>') as HTMLAudioElement

    mediaInteractionCallback = jasmine.createSpy()
    const scope = createSerializationScopeForTesting({ emitRecord: mediaInteractionCallback })
    takeFullSnapshotForTesting(scope)

    mediaInteractionTracker = trackMediaInteraction(scope)
    registerCleanupTask(() => {
      mediaInteractionTracker.stop()
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
