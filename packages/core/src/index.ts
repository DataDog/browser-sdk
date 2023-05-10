export {
  Configuration,
  InitConfiguration,
  buildCookieOptions,
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  EndpointBuilder,
  serializeConfiguration,
  INTAKE_SITE_AP1,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1,
  INTAKE_SITE_US1_FED,
  INTAKE_SITE_EU1,
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
  canUseEventBridge,
  getEventBridge,
  startBatchWithReplica,
  createFlushController,
  FlushEvent,
  FlushReason,
} from './transport'
export * from './tools/display'
export * from './tools/utils/urlPolyfill'
export * from './tools/utils/timeUtils'
export * from './tools/utils/arrayUtils'
export * from './tools/serialisation/sanitize'
export * from './tools/getGlobalObject'
export { AbstractLifeCycle } from './tools/abstractLifeCycle'
export * from './domain/eventRateLimiter/createEventRateLimiter'
export * from './tools/utils/browserDetection'
export { sendToExtension } from './tools/sendToExtension'
export { runOnReadyState } from './browser/runOnReadyState'
export { getZoneJsOriginalValue } from './tools/getZoneJsOriginalValue'
export { instrumentMethod, instrumentMethodAndCallOriginal, instrumentSetter } from './tools/instrumentMethod'
export {
  computeRawError,
  createHandlingStack,
  toStackTraceString,
  getFileFromStackTraceString,
  NO_ERROR_STACK_PRESENT_MESSAGE,
} from './domain/error/error'
export { NonErrorPrefix } from './domain/error/error.types'
export { Context, ContextArray, ContextValue } from './tools/serialisation/context'
export { areCookiesAuthorized, getCookie, setCookie, deleteCookie, COOKIE_ACCESS_DELAY } from './browser/cookie'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchResolveContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { createPageExitObservable, PageExitEvent, PageExitReason, isPageExitReason } from './browser/pageExitObservable'
export * from './browser/addEventListener'
export * from './tools/timer'
export { initConsoleObservable, resetConsoleObservable, ConsoleLog } from './domain/console/consoleObservable'
export { BoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export { createContextManager, ContextManager } from './tools/serialisation/contextManager'
export {
  warnIfCustomerDataLimitReached,
  CustomerDataType,
  CUSTOMER_DATA_BYTES_LIMIT,
} from './tools/serialisation/heavyCustomerDataWarning'
export { ValueHistory, ValueHistoryEntry, CLEAR_OLD_VALUES_INTERVAL } from './tools/valueHistory'
export { readBytesFromStream } from './tools/readBytesFromStream'
export { SESSION_COOKIE_NAME } from './domain/session/sessionCookieStore'
export {
  willSyntheticsInjectRum,
  getSyntheticsTestId,
  getSyntheticsResultId,
} from './domain/synthetics/syntheticsWorkerValues'
export { User, checkUser, sanitizeUser } from './domain/user'
export * from './domain/resourceUtils'
export * from './tools/utils/polyfills'
export * from './tools/utils/numberUtils'
export * from './tools/utils/byteUtils'
export * from './tools/utils/objectUtils'
export * from './tools/utils/functionUtils'
export * from './tools/serialisation/jsonStringify'
export * from './tools/mergeInto'
export * from './tools/utils/stringUtils'
export * from './tools/matchOption'
export * from './tools/utils/responseUtils'
export * from './tools/utils/typeUtils'
export { ErrorHandling } from './domain/error/error.types'
export { ErrorSource } from './domain/error/error.types'
export { RawError } from './domain/error/error.types'
export { RawErrorCause } from './domain/error/error.types'
export { ErrorWithCause } from './domain/error/error.types'
