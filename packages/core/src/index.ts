export { DEFAULT_CONFIGURATION, Configuration, UserConfiguration, buildCookieOptions } from './domain/configuration'
export { startAutomaticErrorCollection, ErrorObservable } from './domain/automaticErrorCollection'
export { computeStackTrace } from './domain/tracekit'
export {
  BuildEnv,
  BuildMode,
  defineGlobal,
  makePublicApi,
  commonInit,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
} from './boot/init'
export {
  InternalMonitoring,
  MonitoringMessage,
  monitored,
  monitor,
  callMonitored,
  addMonitoringMessage,
  addErrorToMonitoringBatch,
  setDebugMode,
} from './domain/internalMonitoring'
export { Observable } from './tools/observable'
export {
  startSessionManagement,
  SESSION_TIME_OUT_DELAY,
  // Exposed for tests
  SESSION_COOKIE_NAME,
  stopSessionManagement,
} from './domain/sessionManagement'
export { HttpRequest, Batch } from './transport/transport'
export * from './tools/urlPolyfill'
export * from './tools/utils'
export { ErrorSource, formatUnknownError, RawError } from './tools/error'
export { combine, Context, ContextArray, ContextValue, deepClone } from './tools/context'
export { areCookiesAuthorized, getCookie, setCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { startXhrProxy, XhrCompleteContext, XhrStartContext, XhrProxy, resetXhrProxy } from './browser/xhrProxy'
export {
  startFetchProxy,
  FetchCompleteContext,
  FetchStartContext,
  FetchProxy,
  resetFetchProxy,
} from './browser/fetchProxy'
export { BoundedBuffer } from './tools/boundedBuffer'
export { createContextManager } from './tools/contextManager'
export { limitModification } from './tools/limitModification'

export * from './tools/specHelper'
export { Datacenter } from './domain/transportConfiguration'
