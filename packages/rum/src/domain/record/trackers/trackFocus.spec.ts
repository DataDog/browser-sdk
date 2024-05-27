import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import { trackFocus, type FocusCallback } from './trackFocus'
import type { Tracker } from './types'

describe('trackFocus', () => {
  let focusTracker: Tracker
  let focusCallback: jasmine.Spy<FocusCallback>
  let configuration: RumConfiguration

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    focusCallback = jasmine.createSpy()
    focusTracker = trackFocus(configuration, focusCallback)
  })

  afterEach(() => {
    focusTracker.stop()
  })

  it('collects focus', () => {
    spyOn(document, 'hasFocus').and.returnValue(true)
    window.dispatchEvent(createNewEvent('focus'))

    expect(focusCallback).toHaveBeenCalledOnceWith({
      timestamp: jasmine.any(Number),
      type: RecordType.Focus,
      data: { has_focus: true },
    })
  })

  it('collects blur', () => {
    spyOn(document, 'hasFocus').and.returnValue(false)
    window.dispatchEvent(createNewEvent('blur'))

    expect(focusCallback).toHaveBeenCalledOnceWith({
      timestamp: jasmine.any(Number),
      type: RecordType.Focus,
      data: { has_focus: false },
    })
  })
})
