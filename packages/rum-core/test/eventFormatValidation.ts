import { registerCleanupTask } from '@datadog/browser-core/test'
import type { TimeStamp, Context } from '@datadog/browser-core'
import { combine } from '@datadog/browser-core'
import type { LifeCycle, RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { LifeCycleEventType } from '../src/domain/lifeCycle'
import type { RawRumEvent, RumContext } from '../src/rawRumEvent.types'
import { validateRumFormat } from './formatValidation'

export function collectAndValidateRawRumEvents(lifeCycle: LifeCycle) {
  const rawRumEvents: Array<RawRumEventCollectedData<RawRumEvent>> = []
  const subscription = lifeCycle.subscribe(LifeCycleEventType.RAW_RUM_EVENT_COLLECTED, (data) => {
    rawRumEvents.push(data)
    validateRumEventFormat(data.rawRumEvent)
  })
  registerCleanupTask(() => {
    subscription.unsubscribe()
  })

  return rawRumEvents
}

function validateRumEventFormat(rawRumEvent: RawRumEvent) {
  const fakeId = '00000000-aaaa-0000-aaaa-000000000000'
  const fakeContext: RumContext = {
    _dd: {
      format_version: 2,
      drift: 0,
      configuration: {
        session_sample_rate: 40,
        session_replay_sample_rate: 60,
      },
    },
    application: {
      id: fakeId,
    },
    date: 0 as TimeStamp,
    source: 'browser',
    session: {
      id: fakeId,
      type: 'user',
    },
    view: {
      id: fakeId,
      referrer: '',
      url: 'fake url',
    },
    connectivity: {
      status: 'connected',
      interfaces: ['wifi'],
      effective_type: '4g',
    },
  }
  validateRumFormat(combine(fakeContext as RumContext & Context, rawRumEvent))
}
