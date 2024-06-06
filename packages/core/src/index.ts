export {
  Configuration,
  InitConfiguration,
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  TraceContextInjection,
  EndpointBuilder,
  serializeConfiguration,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1,
  INTAKE_SITE_US1_FED,
  INTAKE_SITE_EU1,
} from './domain/configuration'
export { TrackingConsent, TrackingConsentState, createTrackingConsentState } from './domain/trackingConsent'
export {
  isExperimentalFeatureEnabled,
  addExperimentalFeatures,
  resetExperimentalFeatures,
  getExperimentalFeatures,
  initFeatureFlags,
  ExperimentalFeature,
} from './tools/experimentalFeatures'
export { trackRuntimeError } from './domain/error/trackRuntimeError'
export { computeStackTrace, StackTrace } from './tools/stackTrace/computeStackTrace'
export { defineGlobal, makePublicApi, PublicApi } from './boot/init'
export { displayAlreadyInitializedError } from './boot/displayAlreadyInitializedError'
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
  addTelemetryUsage,
  drainPreStartTelemetry,
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
  canUseEventBridge,
  getEventBridge,
  bridgeSupports,
  BridgeCapability,
  startBatchWithReplica,
  createFlushController,
  FlushEvent,
  FlushReason,
} from './transport'
export * from './tools/display'
export { Encoder, EncoderResult, createIdentityEncoder } from './tools/encoder'
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
export { instrumentMethod, instrumentSetter, InstrumentedMethodCall } from './tools/instrumentMethod'
export { computeRawError, getFileFromStackTraceString, NO_ERROR_STACK_PRESENT_MESSAGE } from './domain/error/error'
export { NonErrorPrefix } from './domain/error/error.types'
export { Context, ContextArray, ContextValue } from './tools/serialisation/context'
export {
  areCookiesAuthorized,
  getCookie,
  getInitCookie,
  setCookie,
  deleteCookie,
  resetInitCookies,
} from './browser/cookie'
export { CookieStore, WeakRef, WeakRefConstructor } from './browser/types'
export { initXhrObservable, XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initFetchObservable, FetchResolveContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { createPageExitObservable, PageExitEvent, PageExitReason, isPageExitReason } from './browser/pageExitObservable'
export * from './browser/addEventListener'
export * from './tools/timer'
export { initConsoleObservable, resetConsoleObservable, ConsoleLog } from './domain/console/consoleObservable'
export { BoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export { createContextManager, ContextManager } from './domain/context/contextManager'
export { storeContextManager, removeStorageListeners } from './domain/context/storeContextManager'
export {
  createCustomerDataTrackerManager,
  createCustomerDataTracker,
  CustomerDataTracker,
  CustomerDataTrackerManager,
  CUSTOMER_DATA_BYTES_LIMIT,
  CustomerDataCompressionStatus,
} from './domain/context/customerDataTracker'
export { CustomerDataType } from './domain/context/contextConstants'
export { ValueHistory, ValueHistoryEntry, CLEAR_OLD_VALUES_INTERVAL } from './tools/valueHistory'
export { readBytesFromStream } from './tools/readBytesFromStream'
export { STORAGE_POLL_DELAY } from './domain/session/sessionStore'
export { SESSION_STORE_KEY } from './domain/session/storeStrategies/sessionStoreStrategy'
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
export { ErrorHandling, ErrorSource, RawError, RawErrorCause, ErrorWithCause, Csp } from './domain/error/error.types'
export * from './domain/deflate'
export * from './domain/connectivity'
export * from './tools/stackTrace/handlingStack'
