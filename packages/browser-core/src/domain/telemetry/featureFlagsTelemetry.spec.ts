import { INTAKE_SITE_STAGING } from '@datadog/js-core/transport'
import { createNewEvent, interceptRequests, registerCleanupTask } from '../../../test'
import type { Configuration } from '../configuration'
import {
  FeatureFlagsTelemetryErrorCode,
  FeatureFlagsTelemetryEventType,
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
        type: 'feature_flags_lifecycle',
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
      ddtags: 'sdk_version:test,env:staging',
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
