export {
  Configuration,
  InitConfiguration,
  buildCookieOptions,
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  EndpointBuilder,
  isExperimentalFeatureEnabled,
  updateExperimentalFeatures,
  resetExperimentalFeatures,
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
export { monitored, monitor, callMonitored, setDebugMode } from './tools/monitor'
export { Observable, Subscription } from './tools/observable'
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
  createHttpRequest,
  Batch,
  canUseEventBridge,
  getEventBridge,
  startBatchWithReplica,
} from './transport'
export * from './tools/display'
export * from './tools/urlPolyfill'
export * from './tools/timeUtils'
export * from './tools/utils'
export * from './tools/createEventRateLimiter'
export * from './tools/browserDetection'
export { instrumentMethod, instrumentMethodAndCallOriginal, instrumentSetter } from './tools/instrumentMethod'
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
} from './tools/error'
export { Context, ContextArray, ContextValue } from './tools/context'
export { areCookiesAuthorized, getCookie, setCookie, deleteCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchCompleteContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { initConsoleObservable, ConsoleLog } from './domain/console/consoleObservable'
export { BoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export { createContextManager } from './tools/contextManager'
export { limitModification } from './tools/limitModification'
export { ContextHistory, ContextHistoryEntry, CLEAR_OLD_CONTEXTS_INTERVAL } from './tools/contextHistory'
export { PageExitState, createPageExitState, PageExitEvent } from './tools/pageExitState'
export { SESSION_COOKIE_NAME } from './domain/session/sessionCookieStore'
export {
  willSyntheticsInjectRum,
  getSyntheticsTestId,
  getSyntheticsResultId,
} from './domain/synthetics/syntheticsWorkerValues'
