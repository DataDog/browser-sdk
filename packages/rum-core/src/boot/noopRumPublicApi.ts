import { display } from '@datadog/browser-core'
import type { RumPublicApi } from './rumPublicApi'

/**
 * Implementation of RumPublicApi that does nothing.
 * Use this when you want to disable RUM functionality without changing code that depends on it.
 */
export function createNoopRumPublicApi(): RumPublicApi {
  const noop = () => undefined
  const noopReturn =
    <T>(defaultValue?: T) =>
    () =>
      defaultValue as T

  display.warn('SDK is being initialized in an unsupported environment. SDK will not work as expected.')
  return {
    init: noop,
    addAction: noop,
    addError: noop,
    addTiming: noop,
    setGlobalContext: noop,
    getGlobalContext: noopReturn({}),
    setGlobalContextProperty: noop,
    removeGlobalContextProperty: noop,
    clearGlobalContext: noop,
    setUser: noop,
    getUser: noopReturn({}),
    setUserProperty: noop,
    removeUserProperty: noop,
    clearUser: noop,
    setAccount: noop,
    getAccount: noopReturn({}),
    setAccountProperty: noop,
    removeAccountProperty: noop,
    clearAccount: noop,
    startView: noop,
    setViewName: noop,
    setViewContext: noop,
    setViewContextProperty: noop,
    getViewContext: noopReturn({}),
    getInternalContext: noopReturn({}) as any,
    getInitConfiguration: noopReturn({}) as any,
    startSessionReplayRecording: noop,
    stopSessionReplayRecording: noop,
    setTrackingConsent: noop,
    addFeatureFlagEvaluation: noop,
    stopSession: noop,
    getSessionReplayLink: noopReturn(undefined),
    addDurationVital: noop,
    startDurationVital: noopReturn({}) as any,
    stopDurationVital: noop,
    onReady: (callback) => {
      if (typeof callback === 'function') {
        callback()
      }
    },
    version: 'noop',
  }
}
