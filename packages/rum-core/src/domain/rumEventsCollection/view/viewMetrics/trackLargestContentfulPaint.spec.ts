import type { RelativeTime } from '@datadog/browser-core'
import {
  DOM_EVENT,
  ExperimentalFeature,
  addExperimentalFeatures,
  noop,
  resetExperimentalFeatures,
} from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility, createNewEvent } from '@datadog/browser-core/test'
import type { RumLargestContentfulPaintTiming } from '../../../../browser/performanceCollection'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import type { LifeCycle } from '../../../lifeCycle'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumConfiguration } from '../../../configuration'
import { resetFirstHidden } from './trackFirstHidden'
import { LCP_MAXIMUM_DELAY, trackLargestContentfulPaint } from './trackLargestContentfulPaint'

describe('trackLargestContentfulPaint', () => {
  let setupBuilder: TestSetupBuilder
  let lcpCallback: jasmine.Spy<(value: RelativeTime, targetSelector?: string) => void>
  let configuration: RumConfiguration
  let target: HTMLImageElement

  function newLargestContentfulPaint(lifeCycle: LifeCycle, overrides?: Partial<RumLargestContentfulPaintTiming>) {
    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        entryType: 'largest-contentful-paint',
        startTime: 789 as RelativeTime,
        size: 10,
        element: target,
        ...overrides,
      },
    ])
  }

  beforeEach(() => {
    configuration = {} as RumConfiguration
    lcpCallback = jasmine.createSpy()

    target = document.createElement('img')
    target.setAttribute('id', 'lcp-target-element')
    document.body.appendChild(target)

    setupBuilder = setup().beforeBuild(({ lifeCycle }) =>
      trackLargestContentfulPaint(
        lifeCycle,
        configuration,
        { addWebVitalTelemetryDebug: noop },
        target as unknown as Window,
        lcpCallback
      )
    )
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
    target.parentNode!.removeChild(target)
    resetExperimentalFeatures()
  })

  it('should provide the largest contentful paint timing', () => {
    const { lifeCycle } = setupBuilder.build()

    newLargestContentfulPaint(lifeCycle)
    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, undefined)
  })

  it('should provide the largest contentful paint target selector if FF enabled', () => {
    addExperimentalFeatures([ExperimentalFeature.WEB_VITALS_ATTRIBUTION])
    const { lifeCycle } = setupBuilder.build()

    newLargestContentfulPaint(lifeCycle)
    expect(lcpCallback).toHaveBeenCalledTimes(1 as RelativeTime)
    expect(lcpCallback).toHaveBeenCalledWith(789 as RelativeTime, '#lcp-target-element')
  })

  it('should be discarded if it is reported after a user interaction', () => {
    const { lifeCycle } = setupBuilder.build()

    target.dispatchEvent(createNewEvent(DOM_EVENT.KEY_DOWN, { timeStamp: 1 }))

    newLargestContentfulPaint(lifeCycle)
    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    newLargestContentfulPaint(lifeCycle)
    expect(lcpCallback).not.toHaveBeenCalled()
  })

  it('should be discarded if it is reported after a long time', () => {
    const { lifeCycle } = setupBuilder.build()

    newLargestContentfulPaint(lifeCycle, { startTime: LCP_MAXIMUM_DELAY as RelativeTime })
    expect(lcpCallback).not.toHaveBeenCalled()
  })
})
