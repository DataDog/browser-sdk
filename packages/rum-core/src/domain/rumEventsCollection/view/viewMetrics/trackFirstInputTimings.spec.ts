import type { Duration, RelativeTime } from '@datadog/browser-core'
import { restorePageVisibility, setPageVisibility } from '@datadog/browser-core/test'
import type { TestSetupBuilder } from '../../../../../test'
import { setup } from '../../../../../test'
import { LifeCycleEventType } from '../../../lifeCycle'
import type { RumConfiguration } from '../../../configuration'
import { FAKE_FIRST_INPUT_ENTRY } from '../setupViewTest.specHelper'
import { resetFirstHidden } from './trackFirstHidden'
import { trackFirstInputTimings } from './trackFirstInputTimings'

describe('firstInputTimings', () => {
  let setupBuilder: TestSetupBuilder
  let fitCallback: jasmine.Spy<
    ({
      firstInputDelay,
      firstInputTime,
    }: {
      firstInputDelay: number
      firstInputTime: number
      firstInputTarget: Node | undefined
    }) => void
  >
  let configuration: RumConfiguration

  beforeEach(() => {
    configuration = {} as RumConfiguration
    fitCallback = jasmine.createSpy()
    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackFirstInputTimings(lifeCycle, configuration, fitCallback))
    resetFirstHidden()
  })

  afterEach(() => {
    setupBuilder.cleanup()
    restorePageVisibility()
    resetFirstHidden()
  })

  it('should provide the first input timings', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      { ...FAKE_FIRST_INPUT_ENTRY, target: document.createElement('button') },
    ])
    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith({
      firstInputDelay: 100,
      firstInputTime: 1000,
      firstInputTarget: jasmine.any(Node),
    })
  })

  it('should be discarded if the page is hidden', () => {
    setPageVisibility('hidden')
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [FAKE_FIRST_INPUT_ENTRY])

    expect(fitCallback).not.toHaveBeenCalled()
  })

  it('should be adjusted to 0 if the computed value would be negative due to browser timings imprecisions', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.PERFORMANCE_ENTRIES_COLLECTED, [
      {
        entryType: 'first-input' as const,
        processingStart: 900 as RelativeTime,
        startTime: 1000 as RelativeTime,
        duration: 0 as Duration,
      },
    ])

    expect(fitCallback).toHaveBeenCalledTimes(1)
    expect(fitCallback).toHaveBeenCalledWith({ firstInputDelay: 0, firstInputTime: 1000, firstInputTarget: undefined })
  })
})
