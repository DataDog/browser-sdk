import type { RelativeTime } from '@datadog/browser-core'
import { DOM_EVENT } from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility, createNewEvent } from '@datadog/browser-core/test'
import type { RumLargestContentfulPaintTiming } from '../../../../browser/performanceCollection'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumConfiguration } from '../../../configuration'
import { resetFirstHidden } from './trackFirstHidden'
import { LCP_MAXIMUM_DELAY, trackLargestContentfulPaint } from './trackLargestContentfulPaint'

describe('trackLargestContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let lcpCallback: jasmine.Spy<(value: RelativeTime, lcpElement: Element | undefined) => void>
  let eventTarget: Window
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    lcpCallback = jasmine.createSpy()
    eventTarget = document.createElement('div') as unknown as Window
    setupBuilder = setup().beforeBuild(({ lifeCycle }) =>
      trackLargestContentfulPaint(lifeCycle, configuration, eventTarget, lcpCallback)
    )
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the largest contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY])
    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, jasmine.any(Element))
  })

  it('should be discarded if it is reported after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    eventTarget.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY])
    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY])

    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        ...FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY,
        startTime: LCP_MAXIMUM_DELAY as RelativeTime,
      },
    ])
    expect(lcpCallback).not.toHaveBeenCalled()
  })
})

const FAKE_LARGEST_CONTENTFUL_PAINT_ENTRY: RumLargestContentfulPaintTiming = {
  entryType: 'largest-contentful-paint',
  startTime: 789 as RelativeTime,
  size: 10,
  element: document.createElement('div'),
}
