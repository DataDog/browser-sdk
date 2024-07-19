import type { InitConfiguration } from '@datadog/browser-core'
import { DefaultPrivacyLevel, display, TraceContextInjection } from '@datadog/browser-core'
import { EXHAUSTIVE_INIT_CONFIGURATION, SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION } from '@datadog/browser-core/test'
import type {
  ExtractTelemetryConfiguration,
  CamelToSnakeCase,
  MapInitConfigurationKey,
} from '@datadog/browser-core/test'
import type { RumInitConfiguration } from './configuration'
import { DEFAULT_PROPAGATOR_TYPES, serializeRumConfiguration, validateAndBuildRumConfiguration } from './configuration'

const DEFAULT_INIT_CONFIGURATION = { clientToken: 'xxx', applicationId: 'xxx' }

describe('validateAndBuildRumConfiguration', () => {
  let displayErrorSpy: jasmine.Spy<typeof display.error>
  let displayWarnSpy: jasmine.Spy<typeof display.warn>

  beforeEach(() => {
    displayErrorSpy = spyOn(display, 'error')
    displayWarnSpy = spyOn(display, 'warn')
  })

  describe('applicationId', () => {
    it('does not validate the configuration if it is missing', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, applicationId: undefined as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith(
        'Application ID is not configured, no RUM data will be collected.'
      )
    })
  })

  describe('sessionReplaySampleRate', () => {
    it('defaults to 0 if the option is not provided', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.sessionReplaySampleRate).toBe(0)
    })

    it('is set to `sessionReplaySampleRate` provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 50 })!
          .sessionReplaySampleRate
      ).toBe(50)
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Session Replay Sample Rate must be a number between 0 and 100')

      displayErrorSpy.calls.reset()

      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, sessionReplaySampleRate: 200 })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Session Replay Sample Rate must be a number between 0 and 100')
    })
  })

  describe('traceSampleRate', () => {
    it('defaults to undefined if the option is not provided', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.traceSampleRate).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, traceSampleRate: 50 })!.traceSampleRate
      ).toBe(50)
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, traceSampleRate: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Trace Sample Rate must be a number between 0 and 100')

      displayErrorSpy.calls.reset()
      expect(validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, traceSampleRate: 200 })).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Trace Sample Rate must be a number between 0 and 100')
    })
  })

  describe('traceContextInjection', () => {
    it('defaults to all if no options provided', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.traceContextInjection).toBe('all')
    })
    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, traceContextInjection: 'sampled' })!
          .traceContextInjection
      ).toBe('sampled')
    })
    it('ignores incorrect value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, traceContextInjection: 'foo' as any })!
          .traceContextInjection
      ).toBe(TraceContextInjection.ALL)
    })
  })

  describe('allowedTracingUrls', () => {
    it('defaults to an empty array', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.allowedTracingUrls).toEqual([])
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: ['foo'],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: 'foo', propagatorTypes: DEFAULT_PROPAGATOR_TYPES }])
    })

    it('accepts functions', () => {
      const customOriginFunction = (url: string): boolean => url === 'https://my.origin.com'

      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [customOriginFunction],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: customOriginFunction, propagatorTypes: DEFAULT_PROPAGATOR_TYPES }])
    })

    it('accepts RegExp', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [/az/i],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: /az/i, propagatorTypes: DEFAULT_PROPAGATOR_TYPES }])
    })

    it('keeps headers', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [{ match: 'simple', propagatorTypes: ['b3multi', 'tracecontext'] }],
          service: 'bar',
        })!.allowedTracingUrls
      ).toEqual([{ match: 'simple', propagatorTypes: ['b3multi', 'tracecontext'] }])
    })

    it('should filter out unexpected parameter types', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          service: 'bar',
          allowedTracingUrls: [
            42 as any,
            undefined,
            { match: 42 as any, propagatorTypes: ['datadog'] },
            { match: 'toto' },
          ],
        })!.allowedTracingUrls
      ).toEqual([])

      expect(displayWarnSpy).toHaveBeenCalledTimes(4)
    })

    it('does not validate the configuration if a value is provided and service is undefined', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingUrls: ['foo'] })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Service needs to be configured when tracing is enabled')
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, allowedTracingUrls: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Allowed Tracing URLs should be an array')
    })
  })

  describe('excludedActivityUrls', () => {
    it('defaults to an empty array', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.excludedActivityUrls).toEqual([])
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          excludedActivityUrls: ['foo'],
          service: 'bar',
        })!.excludedActivityUrls
      ).toEqual(['foo'])
    })

    it('accepts functions', () => {
      const customUrlFunction = (url: string): boolean => url === 'foo'

      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          excludedActivityUrls: [customUrlFunction],
          service: 'bar',
        })!.excludedActivityUrls
      ).toEqual([customUrlFunction])
    })

    it('does not validate the configuration if an incorrect value is provided', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, excludedActivityUrls: 'foo' as any })
      ).toBeUndefined()
      expect(displayErrorSpy).toHaveBeenCalledOnceWith('Excluded Activity Urls should be an array')
    })
  })

  describe('trackUserInteractions', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackUserInteractions).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackUserInteractions: true })!
          .trackUserInteractions
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackUserInteractions: false })!
          .trackUserInteractions
      ).toBeFalse()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackUserInteractions: 'foo' as any })!
          .trackUserInteractions
      ).toBeTrue()
    })
  })

  describe('trackViewsManually', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackViewsManually).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: true })!
          .trackViewsManually
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: false })!
          .trackViewsManually
      ).toBeFalse()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackViewsManually: 'foo' as any })!
          .trackViewsManually
      ).toBeTrue()
    })
  })

  describe('startSessionReplayRecordingManually', () => {
    it('defaults to false', () => {
      expect(
        validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.startSessionReplayRecordingManually
      ).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, startSessionReplayRecordingManually: true })!
          .startSessionReplayRecordingManually
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, startSessionReplayRecordingManually: false })!
          .startSessionReplayRecordingManually
      ).toBeFalse()
    })

    it('the provided value is cast to boolean', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          startSessionReplayRecordingManually: 'foo' as any,
        })!.startSessionReplayRecordingManually
      ).toBeTrue()
    })
  })

  describe('actionNameAttribute', () => {
    it('defaults to undefined', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.actionNameAttribute).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, actionNameAttribute: 'foo' })!
          .actionNameAttribute
      ).toBe('foo')
    })
  })

  describe('defaultPrivacyLevel', () => {
    it('defaults to MASK', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.defaultPrivacyLevel).toBe(
        DefaultPrivacyLevel.MASK
      )
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({
          ...DEFAULT_INIT_CONFIGURATION,
          defaultPrivacyLevel: DefaultPrivacyLevel.MASK,
        })!.defaultPrivacyLevel
      ).toBe(DefaultPrivacyLevel.MASK)
    })

    it('ignores incorrect values', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, defaultPrivacyLevel: 'foo' as any })!
          .defaultPrivacyLevel
      ).toBe(DefaultPrivacyLevel.MASK)
    })
  })

  describe('enablePrivacyForActionName', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.enablePrivacyForActionName).toBeFalse()
    })

    it('is true when the option is true', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.enablePrivacyForActionName).toBeFalse()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, enablePrivacyForActionName: true })!
          .enablePrivacyForActionName
      ).toBeTrue()
    })
  })

  describe('trackResources', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackResources).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackResources: true })!.trackResources
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackResources: false })!.trackResources
      ).toBeFalse()
    })
  })

  describe('trackLongTasks', () => {
    it('defaults to false', () => {
      expect(validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!.trackLongTasks).toBeFalse()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackLongTasks: true })!.trackLongTasks
      ).toBeTrue()
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, trackLongTasks: false })!.trackLongTasks
      ).toBeFalse()
    })
  })

  describe('serializeRumConfiguration', () => {
    describe('selected tracing propagators serialization', () => {
      it('should not return any propagator type', () => {
        expect(serializeRumConfiguration(DEFAULT_INIT_CONFIGURATION).selected_tracing_propagators).toEqual([])
      })

      it('should return the default propagator types', () => {
        const simpleTracingConfig: RumInitConfiguration = {
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: ['foo'],
        }
        expect(serializeRumConfiguration(simpleTracingConfig).selected_tracing_propagators).toEqual(
          DEFAULT_PROPAGATOR_TYPES
        )
      })

      it('should return all propagator types', () => {
        const complexTracingConfig: RumInitConfiguration = {
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [
            'foo',
            { match: 'first', propagatorTypes: ['datadog'] },
            { match: 'test', propagatorTypes: ['tracecontext'] },
            { match: 'other', propagatorTypes: ['b3'] },
            { match: 'final', propagatorTypes: ['b3multi'] },
          ],
        }
        expect(serializeRumConfiguration(complexTracingConfig).selected_tracing_propagators).toEqual(
          jasmine.arrayWithExactContents(['datadog', 'b3', 'b3multi', 'tracecontext'])
        )
      })

      it('should survive a configuration with wrong parameters', () => {
        const wrongTracingConfig: RumInitConfiguration = {
          ...DEFAULT_INIT_CONFIGURATION,
          allowedTracingUrls: [42 as any, { match: 'test', propagatorTypes: 42 }, undefined, null, {}],
        }
        expect(serializeRumConfiguration(wrongTracingConfig).selected_tracing_propagators).toEqual([])
      })
    })
  })

  describe('workerUrl', () => {
    it('defaults to undefined', () => {
      const configuration = validateAndBuildRumConfiguration(DEFAULT_INIT_CONFIGURATION)!
      expect(configuration.workerUrl).toBeUndefined()
    })

    it('is set to provided value', () => {
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, workerUrl: '/worker.js' })!.workerUrl
      ).toBe('/worker.js')
      expect(
        validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, workerUrl: 'https://example.org/worker.js' })!
          .workerUrl
      ).toBe('https://example.org/worker.js')
    })
  })

  describe('version parameter validation', () => {
    it('should not reject null', () => {
      const configuration = validateAndBuildRumConfiguration({ ...DEFAULT_INIT_CONFIGURATION, version: null })
      expect(displayErrorSpy).not.toHaveBeenCalled()
      expect(configuration!.version).toBeUndefined()
    })
  })

  describe('plugins', () => {
    it('should be set in the configuration', () => {
      const plugin = {
        name: 'foo',
      }
      const configuration = validateAndBuildRumConfiguration({
        ...DEFAULT_INIT_CONFIGURATION,
        betaPlugins: [plugin],
      })
      expect(configuration!.plugins).toEqual([plugin])
    })
  })
})

describe('serializeRumConfiguration', () => {
  it('should serialize the configuration', () => {
    const exhaustiveRumInitConfiguration: Required<RumInitConfiguration> = {
      ...EXHAUSTIVE_INIT_CONFIGURATION,
      applicationId: 'applicationId',
      beforeSend: () => true,
      excludedActivityUrls: ['toto.com'],
      workerUrl: './worker.js',
      compressIntakeRequests: true,
      allowedTracingUrls: ['foo'],
      traceSampleRate: 50,
      traceContextInjection: TraceContextInjection.ALL,
      defaultPrivacyLevel: 'allow',
      enablePrivacyForActionName: false,
      subdomain: 'foo',
      sessionReplaySampleRate: 60,
      startSessionReplayRecordingManually: true,
      trackUserInteractions: true,
      actionNameAttribute: 'test-id',
      trackViewsManually: true,
      trackResources: true,
      trackLongTasks: true,
      remoteConfigurationId: '123',
      betaPlugins: [{ name: 'foo', getConfigurationTelemetry: () => ({ bar: true }) }],
    }

    type MapRumInitConfigurationKey<Key extends string> = Key extends keyof InitConfiguration
      ? MapInitConfigurationKey<Key>
      : Key extends 'workerUrl' | 'allowedTracingUrls' | 'excludedActivityUrls'
        ? `use_${CamelToSnakeCase<Key>}`
        : Key extends 'trackLongTasks'
          ? 'track_long_task' // oops
          : Key extends 'applicationId' | 'subdomain' | 'remoteConfigurationId'
            ? never
            : Key extends 'betaPlugins' // renamed during public beta
              ? 'plugins'
              : CamelToSnakeCase<Key>

    // By specifying the type here, we can ensure that serializeConfiguration is returning an
    // object containing all expected properties.
    const serializedConfiguration: ExtractTelemetryConfiguration<
      MapRumInitConfigurationKey<keyof RumInitConfiguration> | 'selected_tracing_propagators'
    > = serializeRumConfiguration(exhaustiveRumInitConfiguration)

    expect(serializedConfiguration).toEqual({
      ...SERIALIZED_EXHAUSTIVE_INIT_CONFIGURATION,
      session_replay_sample_rate: 60,
      trace_sample_rate: 50,
      trace_context_injection: TraceContextInjection.ALL,
      use_allowed_tracing_urls: true,
      selected_tracing_propagators: ['tracecontext', 'datadog'],
      use_excluded_activity_urls: true,
      track_user_interactions: true,
      track_views_manually: true,
      start_session_replay_recording_manually: true,
      action_name_attribute: 'test-id',
      default_privacy_level: 'allow',
      enable_privacy_for_action_name: false,
      track_resources: true,
      track_long_task: true,
      use_worker_url: true,
      compress_intake_requests: true,
      plugins: [{ name: 'foo', bar: true }],
    })
  })
})
