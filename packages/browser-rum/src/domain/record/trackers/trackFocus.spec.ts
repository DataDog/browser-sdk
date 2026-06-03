import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../record.types'
import { createRecordingScopeForTesting } from '../test/recordingScope.specHelper'
import { trackFocus } from './trackFocus'
import type { Tracker } from './tracker.types'

describe('trackFocus', () => {
  let focusTracker: Tracker
  let emitRecordCallback: jasmine.Spy<EmitRecordCallback>

  beforeEach(() => {
    emitRecordCallback = jasmine.createSpy()
    focusTracker = trackFocus(emitRecordCallback, createRecordingScopeForTesting())
    registerCleanupTask(() => {
      focusTracker.stop()
    })
  })

  it('collects focus', () => {
    spyOn(document, 'hasFocus').and.returnValue(true)
    window.dispatchEvent(createNewEvent('focus'))

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
      data: { has_focus: true },
      type: RecordType.Focus,
      timestamp: jasmine.any(Number),
    })
  })

  it('collects blur', () => {
    spyOn(document, 'hasFocus').and.returnValue(false)
    window.dispatchEvent(createNewEvent('blur'))

    expect(emitRecordCallback).toHaveBeenCalledOnceWith({
      data: { has_focus: false },
      type: RecordType.Focus,
      timestamp: jasmine.any(Number),
    })
  })
})
