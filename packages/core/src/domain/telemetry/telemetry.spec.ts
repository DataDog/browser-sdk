import { NO_ERROR_STACK_PRESENT_MESSAGE } from '../error/error'
import { callMonitored } from '../../tools/monitor'
import type { ExperimentalFeature } from '../../tools/experimentalFeatures'
import { resetExperimentalFeatures, addExperimentalFeatures } from '../../tools/experimentalFeatures'
import type { Configuration } from '../configuration'
import { INTAKE_SITE_US1_FED, INTAKE_SITE_US1 } from '../intakeSites'
import { setNavigatorOnLine, setNavigatorConnection, createHooks, waitNextMicrotask } from '../../../test'
import type { Context } from '../../tools/serialisation/context'
import { Observable } from '../../tools/observable'
import type { StackTrace } from '../../tools/stackTrace/computeStackTrace'
import { HookNames } from '../../tools/abstractHooks'
import {
  addTelemetryError,
  resetTelemetry,
  scrubCustomerFrames,
  formatError,
  addTelemetryConfiguration,
  addTelemetryUsage,
  TelemetryService,
  startTelemetryCollection,
  addTelemetryMetrics,
  addTelemetryDebug,
  type SampleRateByMetric,
} from './telemetry'
import type { TelemetryEvent } from './telemetryEvent.types'
import { StatusType, TelemetryType } from './rawTelemetryEvent.types'

const NETWORK_METRICS_KIND = 'Network metrics'
const PERFORMANCE_METRICS_KIND = 'Performance metrics'

function startAndSpyTelemetry(configuration?: Partial<Configuration>, sampleRateByMetric: SampleRateByMetric = {}) {
  const observable = new Observable<TelemetryEvent & Context>()

  const events: TelemetryEvent[] = []
  observable.subscribe((event) => events.push(event))
  const hooks = createHooks()
  const telemetry = startTelemetryCollection(
    TelemetryService.RUM,
    {
      maxTelemetryEventsPerPage: 7,
      telemetrySampleRate: 100,
      telemetryUsageSampleRate: 100,
      ...configuration,
    } as Configuration,
    hooks,
    observable,
    sampleRateByMetric
  )

  return {
    getTelemetryEvents: async () => {
      await waitNextMicrotask()
      return events
    },
    telemetry,
    hooks,
  }
}

describe('telemetry', () => {
  afterEach(() => {
    resetTelemetry()
  })

  it('collects "monitor" errors', async () => {
    const { getTelemetryEvents } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect(await getTelemetryEvents()).toEqual([
      jasmine.objectContaining({
        telemetry: jasmine.objectContaining({
          type: TelemetryType.LOG,
          status: StatusType.error,
        }),
      }),
    ])
  })

  describe('addTelemetryConfiguration', () => {
    afterEach(() => {
      resetExperimentalFeatures()
    })

    it('should collects configuration when sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({
        telemetrySampleRate: 100,
        telemetryConfigurationSampleRate: 100,
      })

      addTelemetryConfiguration({})

      expect(await getTelemetryEvents()).toEqual([
        jasmine.objectContaining({
          telemetry: jasmine.objectContaining({
            type: TelemetryType.CONFIGURATION,
            configuration: jasmine.anything(),
          }),
        }),
      ])
    })

    it('should not notify configuration when not sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({
        telemetrySampleRate: 100,
        telemetryConfigurationSampleRate: 0,
      })

      addTelemetryConfiguration({})

      expect(await getTelemetryEvents()).toEqual([])
    })

    it('should not notify configuration when telemetrySampleRate is 0', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({
        telemetrySampleRate: 0,
        telemetryConfigurationSampleRate: 100,
      })

      addTelemetryConfiguration({})

      expect(await getTelemetryEvents()).toEqual([])
    })
  })

  describe('addTelemetryUsage', () => {
    it('should collects usage when sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryUsageSampleRate: 100 })

      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

      expect(await getTelemetryEvents()).toEqual([
        jasmine.objectContaining({
          telemetry: jasmine.objectContaining({
            type: TelemetryType.USAGE,
            usage: jasmine.anything(),
          }),
        }),
      ])
    })

    it('should not notify usage when not sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryUsageSampleRate: 0 })

      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

      expect(await getTelemetryEvents()).toEqual([])
    })

    it('should not notify usage when telemetrySampleRate is 0', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({ telemetrySampleRate: 0, telemetryUsageSampleRate: 100 })

      addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

      expect(await getTelemetryEvents()).toEqual([])
    })
  })

  describe('addTelemetryMetrics', () => {
    it('should collect metrics when sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry(
        { telemetrySampleRate: 100 },
        { [PERFORMANCE_METRICS_KIND]: 100 }
      )

      addTelemetryMetrics(PERFORMANCE_METRICS_KIND, { speed: 1000 })

      expect(await getTelemetryEvents()).toEqual([
        jasmine.objectContaining({
          telemetry: jasmine.objectContaining({
            type: TelemetryType.LOG,
            message: PERFORMANCE_METRICS_KIND,
            status: StatusType.debug,
          }),
        }),
      ])
    })

    it('should not notify metrics when telemetry not sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry(
        { telemetrySampleRate: 0 },
        { [PERFORMANCE_METRICS_KIND]: 100 }
      )

      addTelemetryMetrics(PERFORMANCE_METRICS_KIND, { speed: 1000 })

      expect(await getTelemetryEvents()).toEqual([])
    })

    it('should not notify metrics when metric not sampled', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry(
        { telemetrySampleRate: 100 },
        { [PERFORMANCE_METRICS_KIND]: 0 }
      )

      addTelemetryMetrics(PERFORMANCE_METRICS_KIND, { speed: 1000 })

      expect(await getTelemetryEvents()).toEqual([])
    })
  })

  it('should contains feature flags', async () => {
    addExperimentalFeatures(['foo' as ExperimentalFeature])
    const { getTelemetryEvents } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect((await getTelemetryEvents())[0].experimental_features).toEqual(['foo'])
  })

  it('should contains runtime env', async () => {
    const { getTelemetryEvents } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect((await getTelemetryEvents())[0].telemetry.runtime_env).toEqual({
      is_local_file: jasmine.any(Boolean),
      is_worker: jasmine.any(Boolean),
    })
  })

  it('should contain connectivity information', async () => {
    setNavigatorOnLine(false)
    setNavigatorConnection({ type: 'wifi', effectiveType: '4g' })

    const { getTelemetryEvents } = startAndSpyTelemetry()
    callMonitored(() => {
      throw new Error('message')
    })

    expect((await getTelemetryEvents())[0].telemetry.connectivity).toEqual({
      status: 'not_connected',
      interfaces: ['wifi'],
      effective_type: '4g',
    })
  })

  it('should collect pre start events', async () => {
    addTelemetryUsage({ feature: 'set-tracking-consent', tracking_consent: 'granted' })

    const { getTelemetryEvents } = startAndSpyTelemetry({ telemetrySampleRate: 100, telemetryUsageSampleRate: 100 })

    expect((await getTelemetryEvents()).length).toBe(1)
  })

  describe('assemble telemetry hook', () => {
    it('should add default telemetry event attributes', async () => {
      const { getTelemetryEvents, hooks } = startAndSpyTelemetry()

      hooks.register(HookNames.AssembleTelemetry, () => ({ foo: 'bar' }))

      callMonitored(() => {
        throw new Error('foo')
      })

      expect((await getTelemetryEvents())[0].foo).toEqual('bar')
    })

    it('should add context progressively', async () => {
      const { hooks, getTelemetryEvents } = startAndSpyTelemetry()
      hooks.register(HookNames.AssembleTelemetry, () => ({
        application: {
          id: 'bar',
        },
      }))
      callMonitored(() => {
        throw new Error('foo')
      })
      hooks.register(HookNames.AssembleTelemetry, () => ({
        session: {
          id: '123',
        },
      }))
      callMonitored(() => {
        throw new Error('bar')
      })

      const events = await getTelemetryEvents()
      expect(events[0].application!.id).toEqual('bar')
      expect(events[1].application!.id).toEqual('bar')
      expect(events[1].session!.id).toEqual('123')
    })

    it('should apply telemetry hook on events collected before telemetry is started', async () => {
      addTelemetryDebug('debug 1')

      const { hooks, getTelemetryEvents } = startAndSpyTelemetry()

      hooks.register(HookNames.AssembleTelemetry, () => ({
        application: {
          id: 'bar',
        },
      }))

      const events = await getTelemetryEvents()
      expect(events[0].application!.id).toEqual('bar')
    })
  })

  describe('sampling', () => {
    it('should notify when sampled', async () => {
      spyOn(Math, 'random').and.callFake(() => 0)
      const { getTelemetryEvents } = startAndSpyTelemetry({ telemetrySampleRate: 50 })

      callMonitored(() => {
        throw new Error('message')
      })

      expect((await getTelemetryEvents()).length).toBe(1)
    })

    it('should not notify when not sampled', async () => {
      spyOn(Math, 'random').and.callFake(() => 1)
      const { getTelemetryEvents } = startAndSpyTelemetry({ telemetrySampleRate: 50 })

      callMonitored(() => {
        throw new Error('message')
      })

      expect(await getTelemetryEvents()).toEqual([])
    })
  })

  describe('deduplicating', () => {
    it('should discard already sent telemetry', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry()
      const fooError = new Error('foo')
      const barError = new Error('bar')

      addTelemetryError(fooError)
      addTelemetryError(fooError)
      addTelemetryError(barError)

      const events = await getTelemetryEvents()
      expect(events.length).toBe(2)
      expect(events[0].telemetry.message).toEqual('foo')
      expect(events[1].telemetry.message).toEqual('bar')
    })

    it('should not consider a discarded event for the maxTelemetryEventsPerPage', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({ maxTelemetryEventsPerPage: 2 })

      addTelemetryUsage({ feature: 'stop-session' })
      addTelemetryUsage({ feature: 'stop-session' })
      addTelemetryUsage({ feature: 'start-session-replay-recording' })

      const events = await getTelemetryEvents()
      expect(events.length).toBe(2)
      expect((events[0].telemetry.usage as any).feature).toEqual('stop-session')
      expect((events[1].telemetry.usage as any).feature).toEqual('start-session-replay-recording')
    })
  })

  describe('maxTelemetryEventsPerPage', () => {
    it('should be enforced', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({ maxTelemetryEventsPerPage: 2 })

      addTelemetryUsage({ feature: 'stop-session' })
      addTelemetryUsage({ feature: 'start-session-replay-recording' })
      addTelemetryUsage({ feature: 'start-view' })

      const events = await getTelemetryEvents()
      expect(events.length).toBe(2)
      expect((events[0].telemetry.usage as any).feature).toEqual('stop-session')
      expect((events[1].telemetry.usage as any).feature).toEqual('start-session-replay-recording')
    })

    it('should be enforced separately for different kinds of telemetry', async () => {
      const { getTelemetryEvents } = startAndSpyTelemetry({ maxTelemetryEventsPerPage: 2 })

      // Group 1. These are all distinct kinds of telemetry, so these should all be sent.
      addTelemetryDebug('debug 1')
      addTelemetryError(new Error('error 1'))
      addTelemetryMetrics(NETWORK_METRICS_KIND, { bandwidth: 500 })
      addTelemetryMetrics(PERFORMANCE_METRICS_KIND, { speed: 1000 })
      addTelemetryUsage({ feature: 'stop-session' })

      // Group 2. Again, these should all be sent.
      addTelemetryDebug('debug 2')
      addTelemetryError(new Error('error 2'))
      addTelemetryMetrics(NETWORK_METRICS_KIND, { latency: 50 })
      addTelemetryMetrics(PERFORMANCE_METRICS_KIND, { jank: 50 })
      addTelemetryUsage({ feature: 'start-session-replay-recording' })

      // Group 3. Each of these events should hit the limit for their respective kind of
      // telemetry, so none of them should be sent.
      addTelemetryDebug('debug 3')
      addTelemetryError(new Error('error 3'))
      addTelemetryMetrics(NETWORK_METRICS_KIND, { packet_loss: 99 })
      addTelemetryMetrics(PERFORMANCE_METRICS_KIND, { latency: 500 })
      addTelemetryUsage({ feature: 'start-view' })

      expect((await getTelemetryEvents()).map((event) => event.telemetry)).toEqual([
        // Group 1.
        jasmine.objectContaining({ message: 'debug 1' }),
        jasmine.objectContaining({ message: 'error 1' }),
        jasmine.objectContaining({ message: NETWORK_METRICS_KIND, bandwidth: 500 }),
        jasmine.objectContaining({ message: PERFORMANCE_METRICS_KIND, speed: 1000 }),
        jasmine.objectContaining({ usage: jasmine.objectContaining({ feature: 'stop-session' }) }),

        // Group 2.
        jasmine.objectContaining({ message: 'debug 2' }),
        jasmine.objectContaining({ message: 'error 2' }),
        jasmine.objectContaining({ message: NETWORK_METRICS_KIND, latency: 50 }),
        jasmine.objectContaining({ message: PERFORMANCE_METRICS_KIND, jank: 50 }),
        jasmine.objectContaining({ usage: jasmine.objectContaining({ feature: 'start-session-replay-recording' }) }),
      ])
    })
  })

  describe('excluded sites', () => {
    ;[
      { site: INTAKE_SITE_US1_FED, enabled: false },
      { site: INTAKE_SITE_US1, enabled: true },
    ].forEach(({ site, enabled }) => {
      it(`should be ${enabled ? 'enabled' : 'disabled'} on ${site}`, async () => {
        const { getTelemetryEvents } = startAndSpyTelemetry({ site })

        callMonitored(() => {
          throw new Error('message')
        })

        const events = await getTelemetryEvents()
        if (enabled) {
          expect(events.length).toBe(1)
        } else {
          expect(events.length).toBe(0)
        }
      })
    })
  })
})

describe('formatError', () => {
  it('formats error instances', () => {
    expect(formatError(new Error('message'))).toEqual({
      message: 'message',
      error: {
        kind: 'Error',
        stack: jasmine.stringMatching(/^Error: message(\n|$)/) as unknown as string,
      },
    })
  })

  it('formats strings', () => {
    expect(formatError('message')).toEqual({
      message: 'Uncaught "message"',
      error: {
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
      },
    })
  })

  it('formats objects', () => {
    expect(formatError({ foo: 'bar' })).toEqual({
      message: 'Uncaught {"foo":"bar"}',
      error: {
        stack: NO_ERROR_STACK_PRESENT_MESSAGE,
      },
    })
  })
})

describe('scrubCustomerFrames', () => {
  it('should remove stack trace frames that are related to customer files', () => {
    ;[
      { scrub: false, url: 'https://www.datadoghq-browser-agent.com/datadog-rum-v4.js' },
      { scrub: false, url: 'https://www.datad0g-browser-agent.com/datadog-rum-v5.js' },
      { scrub: false, url: 'https://d3uc069fcn7uxw.cloudfront.net/datadog-logs-staging.js' },
      { scrub: false, url: 'https://d20xtzwzcl0ceb.cloudfront.net/datadog-rum-canary.js' },
      { scrub: false, url: 'http://localhost/index.html' },
      { scrub: false, url: undefined },
      { scrub: false, url: '<anonymous>' },
      { scrub: true, url: 'https://foo.bar/path?qux=qix' },
    ].forEach(({ url, scrub }) => {
      const candidate: Partial<StackTrace> = {
        stack: [{ url }],
      }
      expect(scrubCustomerFrames(candidate as StackTrace).stack.length).toBe(scrub ? 0 : 1, `for url: ${url!}`)
    })
  })
})
