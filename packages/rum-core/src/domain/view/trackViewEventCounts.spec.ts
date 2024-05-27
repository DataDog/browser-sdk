import type { Context } from '@datadog/browser-core'
import type { RumEvent } from '../../rumEvent.types'
import { LifeCycleEventType } from '../lifeCycle'
import type { TestSetupBuilder } from '../../../test'
import { setup } from '../../../test'
import { RumEventType } from '../../rawRumEvent.types'
import { trackViewEventCounts } from './trackViewEventCounts'

describe('trackViewEventCounts', () => {
  let setupBuilder: TestSetupBuilder
  let onChange: () => void

  beforeEach(() => {
    onChange = jasmine.createSpy('onChange')

    setupBuilder = setup().beforeBuild(({ lifeCycle }) => trackViewEventCounts(lifeCycle, 'view-id', onChange))
  })

  it('should track events count', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      view: { id: 'view-id' },
      type: RumEventType.ERROR,
    } as RumEvent & Context)

    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('should not count child events unrelated to the view', () => {
    const { lifeCycle } = setupBuilder.build()

    lifeCycle.notify(LifeCycleEventType.RUM_EVENT_COLLECTED, {
      view: { id: 'unrelated-view-id' },
      type: RumEventType.ERROR,
    } as RumEvent & Context)

    expect(onChange).not.toHaveBeenCalled()
  })
})
