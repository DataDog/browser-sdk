import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
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
  let emitRecordCallback: Mock<EmitRecordCallback>
  let audio: HTMLAudioElement

  beforeEach(() => {
    audio = appendElement('<audio controls autoplay target></audio>') as HTMLAudioElement

    const scope = createRecordingScopeForTesting()
    takeFullSnapshotForTesting(scope)

    emitRecordCallback = vi.fn()
    mediaInteractionTracker = trackMediaInteraction(emitRecordCallback, scope)
    registerCleanupTask(() => {
      mediaInteractionTracker.stop()
    })
  })

  it('collects play interactions', () => {
    audio.dispatchEvent(createNewEvent('play', { target: audio }))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.MediaInteraction,
        id: expect.any(Number) as unknown as number,
        type: MediaInteractionType.Play,
      },
    })
  })

  it('collects pause interactions', () => {
    audio.dispatchEvent(createNewEvent('pause', { target: audio }))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      type: RecordType.IncrementalSnapshot,
      timestamp: expect.any(Number),
      data: {
        source: IncrementalSource.MediaInteraction,
        id: expect.any(Number) as unknown as number,
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
