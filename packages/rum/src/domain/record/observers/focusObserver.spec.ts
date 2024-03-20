import { DefaultPrivacyLevel, isIE } from '@datadog/browser-core'
import { createNewEvent } from '@datadog/browser-core/test'
import type { RumConfiguration } from '@datadog/browser-rum-core'
import { RecordType } from '../../../types'
import { initFocusObserver, type FocusCallback } from './focusObserver'

describe('initFocusObserver', () => {
  let stopFocusObserver: () => void
  let focusCallback: jasmine.Spy<FocusCallback>
  let configuration: RumConfiguration

  beforeEach(() => {
    if (isIE()) {
      pending('IE not supported')
    }
    configuration = { defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW } as RumConfiguration
    focusCallback = jasmine.createSpy()
    stopFocusObserver = initFocusObserver(configuration, focusCallback).stop
  })

  afterEach(() => {
    stopFocusObserver()
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
