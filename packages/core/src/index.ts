export {
  DEFAULT_CONFIGURATION,
  Configuration,
  UserConfiguration,
  isIntakeRequest,
  buildCookieOptions,
} from './domain/configuration'
export { ErrorMessage, ErrorContext, HttpContext, ErrorSource, ErrorObservable } from './domain/errorCollection'
export {
  BuildEnv,
  BuildMode,
  Datacenter,
  defineGlobal,
  makeGlobal,
  commonInit,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
} from './boot/init'
export {
  InternalMonitoring,
  MonitoringMessage,
  monitored,
  monitor,
  addMonitoringMessage,
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

export * from './tools/specHelper'
