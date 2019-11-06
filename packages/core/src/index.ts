export { DEFAULT_CONFIGURATION, Configuration, UserConfiguration } from './configuration'
export { ErrorMessage, ErrorContext, HttpContext, ErrorOrigin, ErrorObservable } from './errorCollection'
export { makeStub, makeGlobal, commonInit } from './init'
export { monitored, monitor, addMonitoringMessage } from './internalMonitoring'
export { Observable } from './observable'
export { RequestType, RequestDetails, startRequestCollection, RequestObservable } from './requestCollection'
export {
  initSession,
  // Exposed for tests
  SESSION_COOKIE_NAME,
  COOKIE_ACCESS_DELAY,
  cleanupActivityTracking,
  setCookie,
  getCookie,
} from './session'
export { HttpRequest, Batch } from './transport'
export * from './utils'

export * from './specHelper'
