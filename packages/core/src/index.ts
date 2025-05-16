export type { Configuration, InitConfiguration, EndpointBuilder } from './domain/configuration'
export {
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  TraceContextInjection,
  serializeConfiguration,
  isSampleRate,
  buildEndpointHost,
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1,
  INTAKE_SITE_US1_FED,
  INTAKE_SITE_EU1,
  INTAKE_URL_PARAMETERS,
  isIntakeUrl,
} from './domain/configuration'
export type { TrackingConsentState } from './domain/trackingConsent'
export { TrackingConsent, createTrackingConsentState } from './domain/trackingConsent'
export {
  isExperimentalFeatureEnabled,
  addExperimentalFeatures,
  resetExperimentalFeatures,
  getExperimentalFeatures,
  initFeatureFlags,
  ExperimentalFeature,
} from './tools/experimentalFeatures'
export { trackRuntimeError } from './domain/error/trackRuntimeError'
export type { StackTrace } from './tools/stackTrace/computeStackTrace'
export { computeStackTrace } from './tools/stackTrace/computeStackTrace'
export type { PublicApi } from './boot/init'
export { defineGlobal, makePublicApi } from './boot/init'
export { displayAlreadyInitializedError } from './boot/displayAlreadyInitializedError'
export { initReportObservable, RawReportType } from './domain/report/reportObservable'
export type {
  Telemetry,
  RawTelemetryEvent,
  RawTelemetryConfiguration,
  TelemetryEvent,
  TelemetryErrorEvent,
  TelemetryDebugEvent,
  TelemetryConfigurationEvent,
  TelemetryUsageEvent,
  RawTelemetryUsage,
  RawTelemetryUsageFeature,
} from './domain/telemetry'
export {
  startTelemetry,
  addTelemetryDebug,
  addTelemetryError,
  startFakeTelemetry,
  resetTelemetry,
  TelemetryService,
  isTelemetryReplicationAllowed,
  addTelemetryConfiguration,
  addTelemetryUsage,
  drainPreStartTelemetry,
} from './domain/telemetry'
export { monitored, monitor, callMonitored, setDebugMode, monitorError } from './tools/monitor'
export type { Subscription } from './tools/observable'
export { Observable } from './tools/observable'
export type { SessionManager } from './domain/session/sessionManager'
export { startSessionManager, stopSessionManager } from './domain/session/sessionManager'
export {
  SESSION_TIME_OUT_DELAY, // Exposed for tests
  SessionPersistence,
} from './domain/session/sessionConstants'
export type { HttpRequest, Payload, FlushEvent, FlushReason } from './transport'
export {
  createHttpRequest,
  canUseEventBridge,
  getEventBridge,
  bridgeSupports,
  BridgeCapability,
  startBatchWithReplica,
  createFlushController,
} from './transport'
export * from './tools/display'
export type { Encoder, EncoderResult } from './tools/encoder'
export { createIdentityEncoder } from './tools/encoder'
export * from './tools/utils/urlPolyfill'
export * from './tools/utils/timeUtils'
export * from './tools/utils/arrayUtils'
export * from './tools/serialisation/sanitize'
export * from './tools/getGlobalObject'
export { AbstractLifeCycle } from './tools/abstractLifeCycle'
export * from './domain/eventRateLimiter/createEventRateLimiter'
export * from './tools/utils/browserDetection'
export { sendToExtension } from './tools/sendToExtension'
export { runOnReadyState, asyncRunOnReadyState } from './browser/runOnReadyState'
export { getZoneJsOriginalValue } from './tools/getZoneJsOriginalValue'
export type { InstrumentedMethodCall } from './tools/instrumentMethod'
export { instrumentMethod, instrumentSetter } from './tools/instrumentMethod'
export {
  computeRawError,
  getFileFromStackTraceString,
  isError,
  NO_ERROR_STACK_PRESENT_MESSAGE,
} from './domain/error/error'
export { NonErrorPrefix } from './domain/error/error.types'
export type { Context, ContextArray, ContextValue } from './tools/serialisation/context'
export {
  areCookiesAuthorized,
  getCookie,
  getInitCookie,
  setCookie,
  deleteCookie,
  resetInitCookies,
} from './browser/cookie'
export type { CookieStore, WeakRef, WeakRefConstructor } from './browser/browser.types'
export type { XhrCompleteContext, XhrStartContext } from './browser/xhrObservable'
export { initXhrObservable } from './browser/xhrObservable'
export type { FetchResolveContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { initFetchObservable, resetFetchObservable } from './browser/fetchObservable'
export type { PageMayExitEvent } from './browser/pageMayExitObservable'
export { createPageMayExitObservable, PageExitReason, isPageExitReason } from './browser/pageMayExitObservable'
export * from './browser/addEventListener'
export { requestIdleCallback } from './tools/requestIdleCallback'
export * from './tools/taskQueue'
export * from './tools/timer'
export type { ConsoleLog } from './domain/console/consoleObservable'
export { initConsoleObservable, resetConsoleObservable } from './domain/console/consoleObservable'
export type { BoundedBuffer } from './tools/boundedBuffer'
export { createBoundedBuffer } from './tools/boundedBuffer'
export { catchUserErrors } from './tools/catchUserErrors'
export type { ContextManager } from './domain/context/contextManager'
export { createContextManager } from './domain/context/contextManager'
export { storeContextManager, removeStorageListeners } from './domain/context/storeContextManager'
export { CustomerDataType, CustomerContextKey, ContextManagerMethod } from './domain/context/contextConstants'
export type { ValueHistory, ValueHistoryEntry } from './tools/valueHistory'
export { createValueHistory, CLEAR_OLD_VALUES_INTERVAL } from './tools/valueHistory'
export { readBytesFromStream } from './tools/readBytesFromStream'
export type { SessionState } from './domain/session/sessionState'
export { STORAGE_POLL_DELAY } from './domain/session/sessionStore'
export { SESSION_STORE_KEY } from './domain/session/storeStrategies/sessionStoreStrategy'
export {
  willSyntheticsInjectRum,
  getSyntheticsTestId,
  getSyntheticsResultId,
} from './domain/synthetics/syntheticsWorkerValues'
export type { User } from './domain/user.types'
export type { Account } from './domain/account.types'
export { checkContext } from './domain/context/contextUtils'
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
export type { RawError, RawErrorCause, ErrorWithCause, Csp } from './domain/error/error.types'
export { ErrorHandling, ErrorSource } from './domain/error/error.types'
export * from './domain/deflate'
export * from './domain/connectivity'
export * from './tools/stackTrace/handlingStack'
export * from './tools/abstractHooks'
