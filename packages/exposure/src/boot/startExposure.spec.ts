import type { ContextManager, Payload } from '@datadog/browser-core'
import {
  ErrorSource,
  display,
  stopSessionManager,
  getCookie,
  SESSION_STORE_KEY,
  createTrackingConsentState,
  TrackingConsent,
  setCookie,
  STORAGE_POLL_DELAY,
  ONE_MINUTE,
} from '@datadog/browser-core'
import type { Clock, Request } from '@datadog/browser-core/test'
import {
  interceptRequests,
  mockEndpointBuilder,
  mockEventBridge,
  mockSyntheticsWorkerValues,
  registerCleanupTask,
  mockClock,
  expireCookie,
  DEFAULT_FETCH_MOCK,
} from '@datadog/browser-core/test'

import type { ExposureConfiguration } from '../domain/configuration'
import { validateAndBuildExposureConfiguration } from '../domain/configuration'
import type { ExposureEvent } from '../exposureEvent.types'
import { startExposure } from './startExposure'

function getExposureEvent(requests: Request[], index: number) {
  return JSON.parse(requests[index].body) as ExposureEvent
}

interface Rum {
  getInternalContext(startTime?: number): any
}
declare global {
  interface Window {
    DD_RUM?: Rum
    DD_RUM_SYNTHETICS?: Rum
  }
}

const COMMON_CONTEXT = {
  view: { id: 'view_id', referrer: 'common_referrer', url: 'common_url' },
  user: {},
  application: { id: 'app_id' },
}
const DEFAULT_PAYLOAD = {} as Payload

describe('startExposure', () => {
  let baseConfiguration: ExposureConfiguration
  let interceptor: ReturnType<typeof interceptRequests>
  let requests: Request[]
  let trackExposure: ReturnType<typeof startExposure>['trackExposure']
  let stopExposure: () => void
  let consoleLogSpy: jasmine.Spy
  let displayLogSpy: jasmine.Spy
  let globalContext: ContextManager
  let accountContext: ContextManager
  let userContext: ContextManager

  beforeEach(() => {
    baseConfiguration = {
      ...validateAndBuildExposureConfiguration({ clientToken: 'xxx', service: 'service', telemetrySampleRate: 0 })!,
      exposureEndpointBuilder: mockEndpointBuilder('https://localhost/v1/input/exposure'),
      maxBatchSize: 1,
    }
    interceptor = interceptRequests()
    requests = interceptor.requests
    consoleLogSpy = spyOn(console, 'log')
    displayLogSpy = spyOn(display, 'log')
  })

  afterEach(() => {
    delete window.DD_RUM
    stopSessionManager()
  })

  describe('request', () => {
    it('should send the needed data', async () => {
      ;({ trackExposure, stop: stopExposure } = startExposure(
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag_key', 'flag_value', { context: { foo: 'bar' } })

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      expect(requests[0].url).toContain(baseConfiguration.exposureEndpointBuilder.build('fetch', DEFAULT_PAYLOAD))
      expect(getExposureEvent(requests, 0)).toEqual({
        date: jasmine.any(Number),
        exposure: {
          flag_key: 'flag_key',
          flag_value: 'flag_value',
        },
        foo: 'bar',
        service: 'service',
        session_id: jasmine.any(String),
        session: {
          id: jasmine.any(String),
        },
        view: {
          id: 'view_id',
          referrer: 'common_referrer',
          url: 'common_url',
        },
        usr: {
          anonymous_id: jasmine.any(String),
        },
        _dd: {
          format_version: 2,
        },
      })
    })

    it('should batch events according to maxBatchSize', async () => {
      ;({ trackExposure, stop: stopExposure } = startExposure(
        { ...baseConfiguration, maxBatchSize: 2 },
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag1', 'value1')
      trackExposure('flag2', 'value2')

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(1)
      const batch = JSON.parse(requests[0].body)
      expect(Array.isArray(batch)).toBeTrue()
      expect(batch.length).toBe(2)
    })

    it('should send bridge event when bridge is present', () => {
      const sendSpy = spyOn(mockEventBridge(), 'send')
      ;({ trackExposure, stop: stopExposure } = startExposure(
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag_key', 'flag_value')

      expect(requests.length).toEqual(0)
      const [message] = sendSpy.calls.mostRecent().args
      const parsedMessage = JSON.parse(message)
      expect(parsedMessage).toEqual({
        eventType: 'exposure',
        event: jasmine.objectContaining({ flag_key: 'flag_key', flag_value: 'flag_value' }),
      })
    })
  })

  describe('sampling', () => {
    it('should be applied when event bridge is present', () => {
      const sendSpy = spyOn(mockEventBridge(), 'send')

      let configuration = { ...baseConfiguration, sessionSampleRate: 0 }
      ;({ trackExposure, stop: stopExposure } = startExposure(
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)
      trackExposure('flag_key', 'flag_value')

      expect(sendSpy).not.toHaveBeenCalled()

      configuration = { ...baseConfiguration, sessionSampleRate: 100 }
      ;({ trackExposure, stop: stopExposure } = startExposure(
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)
      trackExposure('flag_key', 'flag_value')

      expect(sendSpy).toHaveBeenCalled()
    })
  })

  describe('context', () => {
    it('should include user context', async () => {
      ;({ trackExposure, stop: stopExposure, userContext } = startExposure(
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      userContext.setContext({ id: 'user_id', name: 'user_name' })
      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      expect(getExposureEvent(requests, 0).usr).toEqual({
        id: 'user_id',
        name: 'user_name',
        anonymous_id: jasmine.any(String),
      })
    })

    it('should include global context', async () => {
      ;({ trackExposure, stop: stopExposure, globalContext } = startExposure(
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      globalContext.setContext({ global_attr: 'global_value' })
      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      expect(getExposureEvent(requests, 0).global_attr).toBe('global_value')
    })

    it('should include account context', async () => {
      ;({ trackExposure, stop: stopExposure, accountContext } = startExposure(
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      accountContext.setContext({ account_id: 'account_123' })
      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      expect(getExposureEvent(requests, 0).account_id).toBe('account_123')
    })
  })

  describe('beforeSend', () => {
    it('should call beforeSend callback', async () => {
      const beforeSendSpy = jasmine.createSpy('beforeSend').and.returnValue(true)
      const configuration = {
        ...baseConfiguration,
        beforeSend: beforeSendSpy,
      }

      ;({ trackExposure, stop: stopExposure } = startExposure(
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      expect(beforeSendSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ flag_key: 'flag_key', flag_value: 'flag_value' }),
        jasmine.any(Object)
      )
    })

    it('should not send event when beforeSend returns false', async () => {
      const beforeSendSpy = jasmine.createSpy('beforeSend').and.returnValue(false)
      const configuration = {
        ...baseConfiguration,
        beforeSend: beforeSendSpy,
      }

      ;({ trackExposure, stop: stopExposure } = startExposure(
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      expect(requests.length).toEqual(0)
      expect(beforeSendSpy).toHaveBeenCalled()
    })
  })

  describe('session management', () => {
    it('should create session when sessionStoreStrategyType is provided', async () => {
      const configuration = {
        ...baseConfiguration,
        sessionStoreStrategyType: { type: 'local-storage' as const },
      }

      ;({ trackExposure, stop: stopExposure } = startExposure(
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      const event = getExposureEvent(requests, 0)
      expect(event.session_id).toBeDefined()
      expect(event.session?.id).toBeDefined()
    })

    it('should use stub session when sessionStoreStrategyType is not provided', async () => {
      const configuration = {
        ...baseConfiguration,
        sessionStoreStrategyType: undefined,
      }

      ;({ trackExposure, stop: stopExposure } = startExposure(
        configuration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))
      registerCleanupTask(stopExposure)

      trackExposure('flag_key', 'flag_value')

      await interceptor.waitForAllFetchCalls()

      const event = getExposureEvent(requests, 0)
      expect(event.session_id).toBeDefined()
      expect(event.session?.id).toBeDefined()
    })
  })

  describe('cleanup', () => {
    it('should stop all components when stop is called', () => {
      ;({ trackExposure, stop: stopExposure } = startExposure(
        baseConfiguration,
        () => COMMON_CONTEXT,
        createTrackingConsentState(TrackingConsent.GRANTED)
      ))

      trackExposure('flag_key', 'flag_value')
      stopExposure()

      // Should not throw when trying to track after stop
      expect(() => trackExposure('flag_key2', 'flag_value2')).not.toThrow()
    })
  })
}) 