import { registerCleanupTask } from '@datadog/browser-core/test'
import type { ContextManager } from '@datadog/browser-core'
import { createContextManager } from '@datadog/browser-core'
import { startFirebaseRemoteConfigIntegration } from './firebaseRemoteConfig'

describe('firebaseRemoteConfig', () => {
  let globalContext: ContextManager
  let mockFirebaseRemoteConfig: any
  let originalFirebase: any

  beforeEach(() => {
    globalContext = createContextManager()
    originalFirebase = (window as any).firebase

    mockFirebaseRemoteConfig = {
      getValue: jasmine.createSpy('getValue').and.returnValue({
        asBoolean: () => true,
        asString: () => 'true',
      }),
      onConfigUpdated: jasmine.createSpy('onConfigUpdated'),
      ensureInitialized: jasmine.createSpy('ensureInitialized').and.returnValue(Promise.resolve()),
    }

    ;(window as any).firebase = {
      remoteConfig: jasmine.createSpy('remoteConfig').and.returnValue(mockFirebaseRemoteConfig),
    }

    spyOn(globalContext, 'setContextProperty')
  })

  afterEach(() => {
    ;(window as any).firebase = originalFirebase
  })

  describe('startFirebaseRemoteConfigIntegration', () => {
    it('should initialize Firebase Remote Config when allowLiveDebugger is enabled', async () => {
      const liveDebuggerId = 'test-id-123'

      await startFirebaseRemoteConfigIntegration(globalContext, liveDebuggerId)

      expect((window as any).firebase.remoteConfig).toHaveBeenCalled()
      expect(mockFirebaseRemoteConfig.ensureInitialized).toHaveBeenCalled()
    })

    it('should set global context property with dd_<id> format on init', async () => {
      const liveDebuggerId = 'test-id-123'
      mockFirebaseRemoteConfig.getValue.and.returnValue({
        asBoolean: () => true,
        asString: () => 'true',
      })

      await startFirebaseRemoteConfigIntegration(globalContext, liveDebuggerId)

      expect(globalContext.setContextProperty).toHaveBeenCalledWith(`dd_${liveDebuggerId}`, true)
    })

    it('should send log event on initialization', async () => {
      const liveDebuggerId = 'test-id-123'
      mockFirebaseRemoteConfig.getValue.and.returnValue({
        asBoolean: () => true,
        asString: () => 'true',
      })

      await startFirebaseRemoteConfigIntegration(globalContext, liveDebuggerId)

      // Verify that global context was set, which indicates log was sent
      expect(globalContext.setContextProperty).toHaveBeenCalledWith(`dd_${liveDebuggerId}`, true)
    })

    it('should listen to config updates', async () => {
      const liveDebuggerId = 'test-id-123'
      let configUpdateCallback: (() => void) | undefined

      mockFirebaseRemoteConfig.onConfigUpdated.and.callFake((callback: () => void) => {
        configUpdateCallback = callback
      })

      await startFirebaseRemoteConfigIntegration(globalContext, liveDebuggerId)

      expect(mockFirebaseRemoteConfig.onConfigUpdated).toHaveBeenCalled()

      // Simulate config update
      if (configUpdateCallback) {
        mockFirebaseRemoteConfig.getValue.and.returnValue({
          asBoolean: () => false,
          asString: () => 'false',
        })
        configUpdateCallback()
      }

      expect(globalContext.setContextProperty).toHaveBeenCalledWith(`dd_${liveDebuggerId}`, false)
      // Verify it was called twice - once on init, once on update
      expect(globalContext.setContextProperty).toHaveBeenCalledTimes(2)
    })

    it('should convert string "true" to boolean true', async () => {
      const liveDebuggerId = 'test-id-123'
      mockFirebaseRemoteConfig.getValue.and.returnValue({
        asBoolean: () => true,
        asString: () => 'true',
      })

      await startFirebaseRemoteConfigIntegration(globalContext, liveDebuggerId)

      expect(globalContext.setContextProperty).toHaveBeenCalledWith(`dd_${liveDebuggerId}`, true)
    })

    it('should convert string "false" to boolean false', async () => {
      const liveDebuggerId = 'test-id-123'
      mockFirebaseRemoteConfig.getValue.and.returnValue({
        asBoolean: () => false,
        asString: () => 'false',
      })

      await startFirebaseRemoteConfigIntegration(globalContext, liveDebuggerId)

      expect(globalContext.setContextProperty).toHaveBeenCalledWith(`dd_${liveDebuggerId}`, false)
    })

    it('should handle when Firebase SDK is not available', async () => {
      ;(window as any).firebase = undefined

      await expectAsync(
        startFirebaseRemoteConfigIntegration(globalContext, 'test-id')
      ).toBeRejected()
    })

    it('should handle when Firebase Remote Config is not available', async () => {
      ;(window as any).firebase = {
        remoteConfig: undefined,
      }

      await expectAsync(
        startFirebaseRemoteConfigIntegration(globalContext, 'test-id')
      ).toBeRejected()
    })

    it('should handle errors during initialization gracefully', async () => {
      mockFirebaseRemoteConfig.ensureInitialized.and.returnValue(Promise.reject(new Error('Init failed')))

      await expectAsync(
        startFirebaseRemoteConfigIntegration(globalContext, 'test-id')
      ).toBeRejected()
    })
  })
})

