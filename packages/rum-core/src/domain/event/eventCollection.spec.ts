import type { Duration, RelativeTime, TimeStamp } from '@datadog/browser-core'
import type { RumEventDomainContext } from '../../domainContext.types'
import { LifeCycle, LifeCycleEventType } from '../lifeCycle'
import { VitalType } from '../../rawRumEvent.types'
import { startEventCollection } from './eventCollection'

describe('eventCollection', () => {
  let lifeCycle: LifeCycle
  let notifySpy: jasmine.Spy

  beforeEach(() => {
    lifeCycle = new LifeCycle()
    notifySpy = spyOn(lifeCycle, 'notify')
  })

  it('should notify lifecycle with raw rum event when adding an event', () => {
    const eventCollection = startEventCollection(lifeCycle)
    const startTime = 123 as RelativeTime
    const duration = 456 as Duration
    const event = {
      type: 'vital' as const,
      date: Date.now() as TimeStamp,
      context: { foo: 'bar' },
      vital: {
        id: '123',
        name: 'test-vital',
        type: VitalType.DURATION,
        duration: 100,
      },
    }
    const domainContext: RumEventDomainContext = { custom: 'context' }

    eventCollection.addEvent(startTime, event, domainContext, duration)

    expect(notifySpy).toHaveBeenCalledWith(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, {
      startTime,
      rawRumEvent: event,
      domainContext,
      duration,
    })
  })
})
