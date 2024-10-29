import { DefaultPrivacyLevel } from '@datadog/browser-core'
import { createNewEvent, registerCleanupTask } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import { trackFocus, type FocusCallback } from './trackFocus'
import type { Tracker } from './tracker.types'

describe('trackFocus', () => {
  let focusTracker: Tracker
  let focusCallback: jasmine.Spy<FocusCallback>
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    focusCallback = jasmine.createSpy()
    focusTracker = trackFocus(configuration, focusCallback)

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
