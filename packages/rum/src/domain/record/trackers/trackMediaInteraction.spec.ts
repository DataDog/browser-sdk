import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { appendElement } from '../../../../../rum-core/test'
import { IncrementalSource, MediaInteractionType, RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { takeFullSnapshotForTesting } from '../test/serialization.specHelper'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackMediaInteraction } from './trackMediaInteraction'
import type { Tracker } from './tracker.types'

describe('trackMediaInteraction', () => {
  let mediaInteractionTracker: Tracker
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>
  let audio: HTMLAudioElement

  beforeEach(() => {
    audio = appendElement('<audio controls autoplay target></audio>') as HTMLAudioElement

    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    emitRecordCallback = jasmine.createSpy()
    mediaInteractionTracker = trackMediaInteraction(emitRecordCallback, scope)
    registerCleanupTask(() => {
      mediaInteractionTracker.stop()
    })
  })

  it('collects play interactions', () => {
    audio.dispatchEvent(createNewEvent('play', { target: audio }))

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
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

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
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

    expect(emitRecordCallback).not.toHaveBeenCalled()
  })
})
