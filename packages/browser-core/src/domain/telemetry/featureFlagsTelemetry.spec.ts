import { INTAKE_SITE_STAGING } from '@datadog/js-core/transport'
import { createNewEvent, interceptRequests, mockEventBridge, registerCleanupTask } from '../../../test'
import type { Configuration } from '../configuration'
import { TrackingConsent } from '../trackingConsent'
import {
  FeatureFlagsTelemetryConfigurationSource,
  FeatureFlagsTelemetryErrorCode,
  FeatureFlagsTelemetryEventType,
  FeatureFlagsTelemetryProviderStatus,
  startFeatureFlagsTelemetry,
} from './featureFlagsTelemetry'

const APPLICATION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('Feature Flags lifecycle telemetry', () => {
  it('sends a schema-shaped provider error to the flagtelemetry track', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), options({ applicationId: APPLICATION_ID }))
    registerCleanupTask(telemetry.stop)

    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(telemetry.enabled).toBeTrue()
    expect(interceptor.requests.length).toBe(1)
    expect(interceptor.requests[0].url).toContain('/api/v2/flagtelemetry?')
    expect(interceptor.requests[0].url).toContain('dd-api-key=client-token')
    expect(JSON.parse(interceptor.requests[0].body)).toEqual({
      product: 'feature_flags',
      event_type: 'provider_error',
      error_code: 'precomputed_assignments_fetch_failed',
      timestamp: jasmine.any(Number),
      runtime_id: jasmine.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
      sequence: 1,
      application_id: APPLICATION_ID,
      environment: 'staging',
      sdk_name: 'dd-openfeature-browser',
      sdk_version: '1.4.0',
      evaluation_reporting_enabled: true,
    })
  })

  it('deduplicates each event type and error code tuple once per runtime', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), options())
    registerCleanupTask(telemetry.stop)

    telemetry.add(fetchError())
    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(interceptor.requests.length).toBe(1)
    expect(interceptor.requests[0].body.trim().split('\n').length).toBe(1)
    expect(JSON.parse(interceptor.requests[0].body).application_id).toBeUndefined()
  })

  it('sends the complete lifecycle event family', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), options({ evaluationReportingEnabled: false }))
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
      .map((event) => JSON.parse(event) as Record<string, unknown>)
    const runtimeId = events[0].runtime_id
    expect(events).toEqual([
      jasmine.objectContaining({
        event_type: 'sdk_init_started',
        sequence: 1,
        runtime_id: runtimeId,
        evaluation_reporting_enabled: false,
      }),
      jasmine.objectContaining({
        event_type: 'configuration_received',
        sequence: 2,
        runtime_id: runtimeId,
        configuration_source: 'remote',
        configuration_version: 'configuration-1',
        configuration_fetched_at: 123,
      }),
      jasmine.objectContaining({
        event_type: 'provider_ready',
        sequence: 3,
        runtime_id: runtimeId,
        provider_status: 'ready',
        init_latency_ms: 456,
      }),
      jasmine.objectContaining({
        event_type: 'provider_error',
        sequence: 4,
        runtime_id: runtimeId,
        error_code: 'precomputed_assignments_fetch_failed',
      }),
      jasmine.objectContaining({
        event_type: 'first_evaluation',
        sequence: 5,
        runtime_id: runtimeId,
      }),
      jasmine.objectContaining({
        event_type: 'init_timeout',
        sequence: 6,
        runtime_id: runtimeId,
        provider_status: 'error',
        error_code: 'initialization_timeout',
        init_latency_ms: 5_000,
      }),
      jasmine.objectContaining({
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
    const telemetry = startFeatureFlagsTelemetry(configuration({ telemetrySampleRate: 0 }), options())
    registerCleanupTask(telemetry.stop)

    telemetry.add(fetchError())
    window.dispatchEvent(createNewEvent('beforeunload'))

    expect(interceptor.requests.length).toBe(1)
  })

  it('flushes pending lifecycle events when stopped', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), options())

    telemetry.add(fetchError())
    expect(interceptor.requests.length).toBe(0)

    telemetry.stop()
    expect(interceptor.requests.length).toBe(1)

    telemetry.stop()
    telemetry.add({ eventType: FeatureFlagsTelemetryEventType.SDK_INIT_STARTED })
    expect(interceptor.requests.length).toBe(1)
  })

  it('counts environment name limits in Unicode code points', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), options({ environmentName: '🚀'.repeat(200) }))

    telemetry.add(fetchError())
    telemetry.stop()

    expect(JSON.parse(interceptor.requests[0].body).environment).toBe('🚀'.repeat(200))
  })

  it('omits environment names over the Unicode code point limit', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration(), options({ environmentName: '🚀'.repeat(201) }))

    telemetry.add(fetchError())
    telemetry.stop()

    expect(JSON.parse(interceptor.requests[0].body).environment).toBeUndefined()
  })

  it('uses HTTP instead of the RUM WebView telemetry bridge', () => {
    const interceptor = interceptRequests()
    const eventBridge = mockEventBridge()
    const sendSpy = spyOn(eventBridge, 'send')
    const telemetry = startFeatureFlagsTelemetry(configuration(), options())

    telemetry.add(fetchError())
    telemetry.stop()

    expect(sendSpy).not.toHaveBeenCalled()
    expect(interceptor.requests.length).toBe(1)
    expect(interceptor.requests[0].url).toContain('/api/v2/flagtelemetry?')
  })

  it('is enabled for production Datadog sites', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(configuration({ site: 'datadoghq.com' }), options())

    telemetry.add(fetchError())
    telemetry.stop()

    expect(telemetry.enabled).toBeTrue()
    expect(interceptor.requests.length).toBe(1)
  })

  it('is disabled when tracking consent is not granted', () => {
    const interceptor = interceptRequests()
    const telemetry = startFeatureFlagsTelemetry(
      configuration({ trackingConsent: TrackingConsent.NOT_GRANTED }),
      options()
    )

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
    trackingConsent: TrackingConsent.GRANTED,
    telemetrySampleRate: 100,
    ...overrides,
  } as Configuration
}

function options(overrides: Partial<Parameters<typeof startFeatureFlagsTelemetry>[1]> = {}) {
  return {
    environmentName: 'staging',
    sdkName: 'dd-openfeature-browser',
    sdkVersion: '1.4.0',
    evaluationReportingEnabled: true,
    ...overrides,
  }
}

function fetchError() {
  return {
    eventType: FeatureFlagsTelemetryEventType.PROVIDER_ERROR,
    errorCode: FeatureFlagsTelemetryErrorCode.PRECOMPUTED_ASSIGNMENTS_FETCH_FAILED,
  }
}
