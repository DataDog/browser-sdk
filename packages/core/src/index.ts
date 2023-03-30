export {
  Configuration,
  InitConfiguration,
  buildCookieOptions,
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  EndpointBuilder,
  serializeConfiguration,
} from './domain/configuration'
export { trackRuntimeError } from './domain/error/trackRuntimeError'
export { computeStackTrace, StackTrace } from './domain/tracekit'
export { defineGlobal, makePublicApi } from './boot/init'
export { initReportObservable, RawReport, RawReportType } from './domain/report/reportObservable'
export {
  startTelemetry,
  Telemetry,
  RawTelemetryEvent,
  RawTelemetryConfiguration,
  addTelemetryDebug,
  addTelemetryError,
  startFakeTelemetry,
  resetTelemetry,
  TelemetryEvent,
  TelemetryErrorEvent,
  TelemetryDebugEvent,
  TelemetryConfigurationEvent,
  TelemetryService,
  isTelemetryReplicationAllowed,
  addTelemetryConfiguration,
} from './domain/telemetry'
export {
  startSessionManager,
  SessionManager,
  // Exposed for tests
  stopSessionManager,
} from './domain/session/sessionManager'
export {
  SESSION_TIME_OUT_DELAY, // Exposed for tests
} from './domain/session/sessionConstants'
export {
  HttpRequest,
  Payload,
  createHttpRequest,
  Batch,
  BatchFlushEvent,
  canUseEventBridge,
  getEventBridge,
  startBatchWithReplica,
} from './transport'
export * from './domain/eventRateLimiter/createEventRateLimiter'
export { runOnReadyState } from './browser/runOnReadyState'
export * from './tools'
export {
  ErrorSource,
  ErrorHandling,
  computeRawError,
  createHandlingStack,
  RawError,
  RawErrorCause,
  ErrorWithCause,
  toStackTraceString,
  getFileFromStackTraceString,
  NO_ERROR_STACK_PRESENT_MESSAGE,
  PROVIDED_ERROR_MESSAGE_PREFIX,
} from './domain/error/error'
export { areCookiesAuthorized, getCookie, setCookie, deleteCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchResolveContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { createPageExitObservable, PageExitEvent, PageExitReason, isPageExitReason } from './browser/pageExitObservable'
export * from './browser/addEventListener'
export { initConsoleObservable, ConsoleLog } from './domain/console/consoleObservable'
export { SESSION_COOKIE_NAME } from './domain/session/sessionCookieStore'
export {
  willSyntheticsInjectRum,
  getSyntheticsTestId,
  getSyntheticsResultId,
} from './domain/synthetics/syntheticsWorkerValues'
export { User, checkUser, sanitizeUser } from './domain/user'
