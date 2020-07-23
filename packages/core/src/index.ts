export { DEFAULT_CONFIGURATION, Configuration, UserConfiguration } from './configuration'
export { ErrorMessage, ErrorContext, HttpContext, ErrorOrigin, ErrorObservable } from './errorCollection'
export {
  BuildEnv,
  BuildMode,
  Datacenter,
  SdkEnv,
  makeStub,
  makeGlobal,
  commonInit,
  checkCookiesAuthorized,
  checkIsNotLocalFile,
} from './init'
export { InternalMonitoring, MonitoringMessage, monitored, monitor, addMonitoringMessage } from './internalMonitoring'
export { Observable } from './observable'
export {
  startSessionManagement,
  SESSION_TIME_OUT_DELAY,
  // Exposed for tests
  SESSION_COOKIE_NAME,
  stopSessionManagement,
} from './sessionManagement'
export { HttpRequest, Batch } from './transport'
export * from './urlPolyfill'
export * from './utils'
export { areCookiesAuthorized, getCookie, setCookie, COOKIE_ACCESS_DELAY } from './cookie'
export { startXhrProxy, XhrContext, XhrProxy } from './xhrProxy'
export { startFetchProxy, FetchContext, FetchProxy } from './fetchProxy'

export * from './specHelper'
