export {
  DEFAULT_CONFIGURATION,
  Configuration,
  InitConfiguration,
  buildCookieOptions,
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
export { BuildEnv, BuildMode, defineGlobal, makePublicApi, commonInit } from './boot/init'
export {
  InternalMonitoring,
  MonitoringMessage,
  monitored,
  monitor,
  callMonitored,
  addMonitoringMessage,
  addErrorToMonitoringBatch,
  startFakeInternalMonitoring,
  resetInternalMonitoring,
  setDebugMode,
} from './domain/internalMonitoring'
export { Observable, Subscription } from './tools/observable'
export {
  startSessionManagement,
  Session,
  SESSION_TIME_OUT_DELAY,
  // Exposed for tests
  SESSION_COOKIE_NAME,
  stopSessionManagement,
} from './domain/sessionManagement'
export { HttpRequest, Batch, isEventBridgePresent, getEventBridge } from './transport'
export * from './tools/display'
export * from './tools/urlPolyfill'
export * from './tools/timeUtils'
export * from './tools/utils'
export * from './tools/createEventRateLimiter'
export * from './tools/browserDetection'
export { instrumentMethod, instrumentMethodAndCallOriginal } from './tools/instrumentMethod'
export { ErrorSource, ErrorHandling, formatUnknownError, createHandlingStack, RawError } from './tools/error'
export { Context, ContextArray, ContextValue } from './tools/context'
export { areCookiesAuthorized, getCookie, setCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchCompleteContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { EndpointBuilder } from './domain/configuration/endpointBuilder'
export { BoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export { createContextManager } from './tools/contextManager'
export { limitModification } from './tools/limitModification'
