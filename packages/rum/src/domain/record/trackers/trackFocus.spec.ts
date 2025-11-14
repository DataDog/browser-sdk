import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import { RecordType } from '../../../types'
import type { EmitRecordCallback } from '../serialization'
import { createSerializationScopeForTesting } from '../test/serializationScope.specHelper'
import { trackFocus } from './trackFocus'
import type { Tracker } from './tracker.types'

describe('trackFocus', () => {
  let focusTracker: Tracker
  let focusCallback: jasmine.Spy<EmitRecordCallback>

  beforeEach(() => {
    focusCallback = jasmine.createSpy()
    const scope = createSerializationScopeForTesting({ emitRecord: focusCallback })

    focusTracker = trackFocus(scope)
    registerCleanupTask(() => {
      focusTracker.stop()
    })
  })

  it('collects focus', () => {
    spyOn(document, 'hasFocus').and.returnValue(true)
    window.dispatchEvent(createNewEvent('focus'))

    expect(focusCallback).toHaveBeenCalledOnceWith({
      data: { has_focus: true },
      type: RecordType.Focus,
      timestamp: jasmine.any(Number),
    })
  })

  it('collects blur', () => {
    spyOn(document, 'hasFocus').and.returnValue(false)
    window.dispatchEvent(createNewEvent('blur'))

    expect(focusCallback).toHaveBeenCalledOnceWith({
      data: { has_focus: false },
      type: RecordType.Focus,
      timestamp: jasmine.any(Number),
    })
  })
})
