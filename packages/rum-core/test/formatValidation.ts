import ajv from 'ajv'
import { registerCleanupTask } from '@datadog/browser-core/test'
import type { TimeStamp, Context } from '@datadog/browser-core'
import { combine } from '@datadog/browser-core'
import type { CommonProperties } from '@datadog/browser-rum-core'
import type { LifeCycle, RawRumEventCollectedData } from '../src/domain/lifeCycle'
import { LifeCycleEventType } from '../src/domain/lifeCycle'
import type { RawRumEvent, RumContext } from '../src/rawRumEvent.types'
import { allJsonSchemas } from './allJsonSchemas'

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
  const fakeContext: Partial<CommonProperties> = {
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
    context: {},
  }
  validateRumFormat(combine(fakeContext as RumContext & Context, rawRumEvent))
}

function validateRumFormat(rumEvent: Context) {
  const instance = new ajv({
    allErrors: true,
  })

  instance.addSchema(allJsonSchemas)

  void instance.validate('rum-events-schema.json', rumEvent)

  if (instance.errors) {
    const errors = instance.errors
      .map((error) => {
        let message = error.message
        if (error.keyword === 'const') {
          message += ` '${(error.params as { allowedValue: string }).allowedValue}'`
        }
        return `  ${error.dataPath || 'event'} ${message}`
      })
      .join('\n')
    fail(`Invalid RUM event format:\n${errors}`)
  }
}
