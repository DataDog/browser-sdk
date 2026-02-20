import { vi, beforeEach, describe, expect, it, type Mock } from 'vitest'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackFocus } from './trackFocus'
import type { Tracker } from './tracker.types'

describe('trackFocus', () => {
  let focusTracker: Tracker
  let emitRecordCallback: Mock<EmitRecordCallback>

  beforeEach(() => {
    emitRecordCallback = vi.fn()
    focusTracker = trackFocus(emitRecordCallback, createRecordingScopeForTesting())
    registerCleanupTask(() => {
      focusTracker.stop()
    })
  })

  it('collects focus', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    window.dispatchEvent(createNewEvent('focus'))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      data: { has_focus: true },
      type: RecordType.Focus,
      timestamp: expect.any(Number),
    })
  })

  it('collects blur', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    window.dispatchEvent(createNewEvent('blur'))

    expect(emitRecordCallback).toHaveBeenCalledTimes(1)
    expect(emitRecordCallback).toHaveBeenCalledWith({
      data: { has_focus: false },
      type: RecordType.Focus,
      timestamp: expect.any(Number),
    })
  })
})
