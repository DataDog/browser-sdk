import { INTAKE_SITE_STAGING } from '@datadog/js-core/transport'
import { createNewEvent, interceptRequests, mockEventBridge, registerCleanupTask } from '../../../test'
import type { Configuration } from '../configuration'
import {
  FeatureFlagsTelemetryConfigurationSource,
  FeatureFlagsTelemetryErrorCode,
  FeatureFlagsTelemetryEventType,
  FeatureFlagsTelemetryProviderStatus,
  startFeatureFlagsTelemetry,
} from './featureFlagsTelemetry'

const APPLICATION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('Feature Flags lifecycle telemetry', () => {
  it('sends a schema-shaped provider error through the RUM telemetry transport', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), {
      applicationId: APPLICATION_ID,
      environmentName: 'staging',
      sdkName: 'dd-openfeature-browser',
      sdkVersion: '1.4.0',
    })
    registerCleanupTask(telemetry.stop)

    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(telemetry.enabled).toBeTrue()
    expect(interceptor.requests.length).toBe(1)
    expect(JSON.parse(interceptor.requests[0].body)).toEqual({
      type: 'telemetry',
      date: jasmine.any(Number),
      service: 'browser-feature-flags-sdk',
      version: '1.4.0',
      source: 'browser',
      _dd: { format_version: 2 },
      telemetry: {
        type: 'log',
        status: 'error',
        message: 'feature_flags.provider_error',
        product: 'feature_flags',
        event_type: 'provider_error',
        error_code: 'precomputed_assignments_fetch_failed',
        timestamp: jasmine.any(Number),
        runtime_id: jasmine.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
        sequence: 1,
        application_id: APPLICATION_ID,
        environment_name: 'staging',
        sdk_name: 'dd-openfeature-browser',
        sdk_version: '1.4.0',
      },
      ddtags: 'sdk_version:1.4.0,env:staging',
    })
  })

  it('deduplicates each event type and error code tuple once per runtime', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), {
      sdkName: 'dd-openfeature-browser',
      sdkVersion: '1.4.0',
    })
    registerCleanupTask(telemetry.stop)

    telemetry.add(fetchError())
    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(interceptor.requests.length).toBe(1)
    expect(interceptor.requests[0].body.trim().split('\n').length).toBe(1)
    expect(JSON.parse(interceptor.requests[0].body).telemetry.application_id).toBeUndefined()
  })

  it('sends the complete lifecycle event family', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), {
      sdkName: 'dd-openfeature-browser',
      sdkVersion: '1.4.0',
      evaluationReportingEnabled: false,
    })
    registerCleanupTask(telemetry.stop)

    telemetry.add({ eventType: FeatureFlagsTelemetryEventType.SDK_INIT_STARTED })
    telemetry.add({
      eventType: FeatureFlagsTelemetryEventType.CONFIGURATION_RECEIVED,
      configurationSource: FeatureFlagsTelemetryConfigurationSource.REMOTE,
      configurationVersion: 'configuration-1',
      configurationFetchedAt: 123,
    })
    telemetry.add({
      eventType: FeatureFlagsTelemetryEventType.PROVIDER_READY,
      providerStatus: FeatureFlagsTelemetryProviderStatus.READY,
      initLatencyMs: 456,
    })
    telemetry.add(fetchError())
    telemetry.add({ eventType: FeatureFlagsTelemetryEventType.FIRST_EVALUATION })
    telemetry.add({
      eventType: FeatureFlagsTelemetryEventType.INIT_TIMEOUT,
      providerStatus: FeatureFlagsTelemetryProviderStatus.ERROR,
      errorCode: FeatureFlagsTelemetryErrorCode.INITIALIZATION_TIMEOUT,
      initLatencyMs: 5_000,
    })
    telemetry.add({
      eventType: FeatureFlagsTelemetryEventType.INIT_FAILED,
      providerStatus: FeatureFlagsTelemetryProviderStatus.ERROR,
      errorCode: FeatureFlagsTelemetryErrorCode.INITIALIZATION_FAILED,
      initLatencyMs: 789,
    })
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(interceptor.requests.length).toBe(1)
    const events = interceptor.requests[0].body
      .trim()
      .split('\n')
      .map((event) => (JSON.parse(event) as { telemetry: Record<string, unknown> }).telemetry)
    const runtimeId = events[0].runtime_id
    expect(events).toEqual([
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'feature_flags.sdk_init_started',
        event_type: 'sdk_init_started',
        sequence: 1,
        runtime_id: runtimeId,
        evaluation_reporting_enabled: false,
      }),
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'feature_flags.configuration_received',
        event_type: 'configuration_received',
        sequence: 2,
        runtime_id: runtimeId,
        configuration_source: 'remote',
        configuration_version: 'configuration-1',
        configuration_fetched_at: 123,
      }),
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'feature_flags.provider_ready',
        event_type: 'provider_ready',
        sequence: 3,
        runtime_id: runtimeId,
        provider_status: 'ready',
        init_latency_ms: 456,
      }),
      jasmine.objectContaining({
        type: 'log',
        status: 'error',
        message: 'feature_flags.provider_error',
        event_type: 'provider_error',
        sequence: 4,
        runtime_id: runtimeId,
        error_code: 'precomputed_assignments_fetch_failed',
      }),
      jasmine.objectContaining({
        type: 'log',
        status: 'debug',
        message: 'feature_flags.first_evaluation',
        event_type: 'first_evaluation',
        sequence: 5,
        runtime_id: runtimeId,
      }),
      jasmine.objectContaining({
        type: 'log',
        status: 'error',
        message: 'feature_flags.init_timeout',
        event_type: 'init_timeout',
        sequence: 6,
        runtime_id: runtimeId,
        provider_status: 'error',
        error_code: 'initialization_timeout',
        init_latency_ms: 5_000,
      }),
      jasmine.objectContaining({
        type: 'log',
        status: 'error',
        message: 'feature_flags.init_failed',
        event_type: 'init_failed',
        sequence: 7,
        runtime_id: runtimeId,
        provider_status: 'error',
        error_code: 'initialization_failed',
        init_latency_ms: 789,
      }),
    ])
  })

  it('is independent from general telemetry sampling', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration({ telemetrySampleRate: 0 }), {
      sdkName: 'dd-openfeature-browser',
      sdkVersion: '1.4.0',
    })
    registerCleanupTask(telemetry.stop)

    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(interceptor.requests.length).toBe(1)
  })

  it('does not throw or retry when a WebView bridge send fails', () => {
    const eventBridge = mockEventBridge()
    const sendSpy = spyOn(eventBridge, 'send').and.throwError('bridge failure')
    const telemetry = startFeatureFlagsTelemetry(configuration(), {
      sdkName: 'dd-openfeature-browser',
      sdkVersion: '1.4.0',
    })
    registerCleanupTask(telemetry.stop)

    expect(() => telemetry.add(fetchError())).not.toThrow()
    expect(() => telemetry.add(fetchError())).not.toThrow()

    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  it('is disabled outside staging for the initial rollout', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration({ site: 'datadoghq.com' }), {
      sdkName: 'dd-openfeature-browser',
      sdkVersion: '1.4.0',
    })

    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(telemetry.enabled).toBeFalse()
    expect(interceptor.requests.length).toBe(0)
  })
})

function configuration(overrides: Partial<Configuration> = {}): Configuration {
  return {
    clientToken: 'client-token',
    site: INTAKE_SITE_STAGING,
    env: 'staging',
    telemetrySampleRate: 100,
    ...overrides,
  } as Configuration
}

function fetchError() {
  return {
    eventType: FeatureFlagsTelemetryEventType.PROVIDER_ERROR,
    errorCode: FeatureFlagsTelemetryErrorCode.PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED,
  }
}
