export {
  Configuration,
  InitConfiguration,
  buildCookieOptions,
  validateAndBuildConfiguration,
  BeforeSendCallback,
  DefaultPrivacyLevel,
} from './domain/configuration'
export {
  isExperimentalFeatureEnabled,
  updateExperimentalFeatures,
  resetExperimentalFeatures,
} from './domain/configuration/experimentalFeatures'
export { trackConsoleError } from './domain/error/trackConsoleError'
export { trackRuntimeError } from './domain/error/trackRuntimeError'
export { computeStackTrace, StackTrace } from './domain/tracekit'
export { BuildEnv, BuildMode, defineGlobal, makePublicApi } from './boot/init'
export {
  startInternalMonitoring,
  InternalMonitoring,
  MonitoringMessage,
  monitored,
  monitor,
  callMonitored,
  addMonitoringMessage,
  addMonitoringError,
  startFakeInternalMonitoring,
  resetInternalMonitoring,
  setDebugMode,
} from './domain/internalMonitoring'
export { Observable, Subscription } from './tools/observable'
export {
  startSessionManager,
  SessionManager,
  // Exposed for tests
  stopSessionManager,
} from './domain/session/sessionManager'
export {
  SESSION_TIME_OUT_DELAY,
  // Exposed for tests
  SESSION_COOKIE_NAME,
} from './domain/session/sessionStore'
export { HttpRequest, Batch, canUseEventBridge, getEventBridge } from './transport'
export * from './tools/display'
export * from './tools/urlPolyfill'
export * from './tools/timeUtils'
export * from './tools/utils'
export * from './tools/createEventRateLimiter'
export * from './tools/browserDetection'
export { instrumentMethod, instrumentMethodAndCallOriginal } from './tools/instrumentMethod'
export { ErrorSource, ErrorHandling, formatUnknownError, createHandlingStack, RawError } from './tools/error'
export { Context, ContextArray, ContextValue } from './tools/context'
export { areCookiesAuthorized, getCookie, setCookie, deleteCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchCompleteContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { EndpointBuilder } from './domain/configuration/endpointBuilder'
export { BoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export { createContextManager } from './tools/contextManager'
export { limitModification } from './tools/limitModification'
export { ContextHistory, CLEAR_OLD_CONTEXTS_INTERVAL } from './tools/contextHistory'
