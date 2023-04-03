export {
  Configuration,
  InitConfiguration,
  buildCookieOptions,
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  EndpointBuilder,
  serializeConfiguration,
} from './domain/configuration'
export {
  isExperimentalFeatureEnabled,
  addExperimentalFeatures,
  resetExperimentalFeatures,
  getExperimentalFeatures,
  ExperimentalFeature,
} from './tools/experimentalFeatures'
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
  Payload,
  createHttpRequest,
  Batch,
  BatchFlushEvent,
  canUseEventBridge,
  getEventBridge,
  startBatchWithReplica,
} from './transport'
export * from './tools/display'
export * from './tools/urlPolyfill'
export * from './tools/timeUtils'
export * from './tools/utils'
export * from './tools/sanitize'
export * from './tools/getGlobalObject'
export * from './domain/eventRateLimiter/createEventRateLimiter'
export * from './tools/browserDetection'
export { sendToExtension } from './tools/sendToExtension'
export { runOnReadyState } from './browser/runOnReadyState'
export { getZoneJsOriginalValue } from './tools/getZoneJsOriginalValue'
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
  NO_ERROR_STACK_PRESENT_MESSAGE,
  PROVIDED_ERROR_MESSAGE_PREFIX,
} from './domain/error/error'
export { Context, ContextArray, ContextValue } from './tools/context'
export { areCookiesAuthorized, getCookie, setCookie, deleteCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchResolveContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { createPageExitObservable, PageExitEvent, PageExitReason, isPageExitReason } from './browser/pageExitObservable'
export * from './browser/addEventListener'
export * from './tools/timer'
export { initConsoleObservable, ConsoleLog } from './domain/console/consoleObservable'
export { BoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export { createContextManager, ContextManager } from './tools/contextManager'
export { warnIfCustomerDataLimitReached, CustomerDataType } from './tools/heavyCustomerDataWarning'
export { limitModification } from './tools/limitModification'
export { ContextHistory, ContextHistoryEntry, CLEAR_OLD_CONTEXTS_INTERVAL } from './tools/contextHistory'
export { readBytesFromStream } from './tools/readBytesFromStream'
export { SESSION_COOKIE_NAME } from './domain/session/sessionCookieStore'
export {
  willSyntheticsInjectRum,
  getSyntheticsTestId,
  getSyntheticsResultId,
} from './domain/synthetics/syntheticsWorkerValues'
export { User, checkUser, sanitizeUser } from './domain/user'
