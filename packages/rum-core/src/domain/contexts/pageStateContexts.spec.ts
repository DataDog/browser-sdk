import { RelativeTime } from '@datadog/browser-core'
import { createNewEvent } from '../../../../core/test/specHelper'
import type { TestSetupBuilder } from '../../../test/specHelper'
import { setup } from '../../../test/specHelper'
import type { PageStateContexts } from './pageStateContexts'
import { startPageStateContexts } from './pageStateContexts'

fdescribe('internal context', () => {
  let pageStateContexts: PageStateContexts
  let setupBuilder: TestSetupBuilder
  let focus = true

  function pagePassive() {
    focus = false
    window.dispatchEvent(createNewEvent('visibilitychange'))
  }

  function pageActive() {
    focus = true
    window.dispatchEvent(createNewEvent('visibilitychange'))
  }

  function pageHidden() {
    spyOnProperty(Document.prototype, 'visibilityState', 'get').and.callFake(() => 'hidden')
    window.dispatchEvent(createNewEvent('visibilitychange'))
  }

  function pageFreeze() {
    window.dispatchEvent(createNewEvent('freeze'))
  }

  beforeEach(() => {
    spyOn(Document.prototype, 'hasFocus').and.callFake(() => focus)

    setupBuilder = setup()
      .withFakeClock()
      .beforeBuild(() => {
        pageStateContexts = startPageStateContexts()
      })
  })

  afterEach(() => {
    setupBuilder.cleanup()
  })

  it('should track the number and duration of all page state', () => {
    const { clock } = setupBuilder.build()
    clock.tick(10)
    pagePassive()

    clock.tick(10)
    pageActive()

    clock.tick(10)
    pagePassive()

    clock.tick(10)
    pageHidden()

    clock.tick(10)
    pageFreeze()

    expect(pageStateContexts.getPageStates(0 as RelativeTime, 60 as RelativeTime)).toEqual({
      active: { count: 1, duration: 10 },
      passive: { count: 2, duration: 20 },
      hidden: { count: 1, duration: 10 },
      frozen: { count: 1, duration: 10 },
      terminated: { count: 0, duration: 0 },
    })

    expect(pageStateContexts.getPageStates(15 as RelativeTime, 45 as RelativeTime)).toEqual({
      active: { count: 1, duration: 10 }, // nop
      passive: { count: 1, duration: 10 },
      hidden: { count: 1, duration: 10 },
      frozen: { count: 0, duration: 0 },
      terminated: { count: 0, duration: 0 },
    })
  })
})
