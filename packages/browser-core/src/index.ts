export type { Configuration, InitConfiguration } from './domain/configuration'
export {
  validateAndBuildConfiguration,
  DefaultPrivacyLevel,
  TraceContextInjection,
  serializeConfiguration,
  isSampleRate,
} from './domain/configuration'
export type { TrackingConsentState } from './domain/trackingConsent'
export { TrackingConsent, createTrackingConsentState } from './domain/trackingConsent'
export {
  isExperimentalFeatureEnabled,
  addExperimentalFeatures,
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
  TelemetryService,
  TelemetryMetrics,
  addTelemetryConfiguration,
  addTelemetryUsage,
  addTelemetryMetrics,
} from './domain/telemetry'
export { monitored, monitor, callMonitored, monitorError } from './tools/monitor'
export type { Subscription } from './tools/observable'
export { Observable, BufferedObservable } from './tools/observable'
export type { SessionManager, SessionContext } from './domain/session/sessionManager'
export { startSessionManager, startSessionManagerStub, stopSessionManager } from './domain/session/sessionManager'
export {
  SESSION_TIME_OUT_DELAY, // Exposed for tests
  SESSION_NOT_TRACKED,
  SessionPersistence,
} from './domain/session/sessionConstants'
export type {
  Batch,
  BandwidthStats,
  HttpRequest,
  HttpRequestEvent,
  Payload,
  FlushEvent,
  FlushReason,
  UrgentFlushReason,
} from './transport'
export {
  createHttpRequest,
  canUseEventBridge,
  getEventBridge,
  bridgeSupports,
  BridgeCapability,
  createBatch,
  createFlushController,
  FLUSH_DURATION_LIMIT,
} from './transport'
export * from './tools/display'
export type { Encoder, EncoderResult } from './tools/encoder'
export { createIdentityEncoder } from './tools/encoder'
export { normalizeUrl, isValidUrl, getPathName, buildUrl, getPristineWindow } from '@datadog/js-core/util'
export * from './tools/utils/arrayUtils'

export * from './tools/serialisation/sanitize'
export { globalObject, isWorkerEnvironment } from '@datadog/js-core/util'
export type { GlobalObject } from '@datadog/js-core/util'
export { AbstractLifeCycle } from './tools/abstractLifeCycle'
export * from './domain/eventRateLimiter/createEventRateLimiter'
export * from './tools/utils/browserDetection'
export { sendToExtension } from './tools/sendToExtension'
export { runOnReadyState, asyncRunOnReadyState } from './browser/runOnReadyState'
export { getZoneJsOriginalValue } from './tools/getZoneJsOriginalValue'
export { mockable } from './tools/mockable'
export type { InstrumentedMethodCall, InstrumentedConstructorCall } from './tools/instrumentMethod'
export { instrumentMethod, instrumentConstructor, instrumentSetter } from './tools/instrumentMethod'
export {
  computeRawError,
  getFileFromStackTraceString,
  isError,
  NO_ERROR_STACK_PRESENT_MESSAGE,
} from './domain/error/error'
export { NonErrorPrefix } from './domain/error/error.types'
export type { Context, ContextArray, ContextValue } from './tools/serialisation/context'
export { getCookie, getInitCookie, setCookie, deleteCookie, resetInitCookies } from './browser/cookie'
export { isCookieStoreSupported } from './browser/cookieAccess'
export type { WeakRef, WeakRefConstructor } from './browser/browser.types'
export type {
  CookieStore,
  NetworkInformation,
  Navigator,
  NetworkInterface,
  NetworkEffectiveType,
  Profiler,
  ProfilerConstructor,
  ProfilerTrace,
  ProfilerInitOptions,
  ProfilerFrame,
  ProfilerStack,
  ProfilerSample,
  ProfilerResource,
  SampleBufferFullEvent,
} from '@datadog/js-core/util'
export type { XhrCompleteContext, XhrStartContext, XhrContext } from './browser/xhrObservable'
export { initXhrObservable } from './browser/xhrObservable'
export type { FetchResolveContext, FetchStartContext, FetchContext } from './browser/fetchObservable'
export { initFetchObservable, ResponseBodyAction } from './browser/fetchObservable'
export type {
  WebSocketContext,
  WebSocketConnectingContext,
  WebSocketOpenContext,
  WebSocketMessageInContext,
  WebSocketMessageOutContext,
  WebSocketClosedContext,
} from './browser/webSocketObservable'
export { initWebSocketObservable } from './browser/webSocketObservable'
export { fetch } from './browser/fetch'
export type { PageMayExitEvent } from './browser/pageMayExitObservable'
export { createPageMayExitObservable, PageExitReason, isPageExitReason } from './browser/pageMayExitObservable'
export * from './browser/addEventListener'
export { requestIdleCallback } from './tools/requestIdleCallback'
export * from './tools/taskQueue'
export * from './tools/timer'
export type { ConsoleLog } from './domain/console/consoleObservable'
export { initConsoleObservable } from './domain/console/consoleObservable'
export { catchUserErrors } from './tools/catchUserErrors'
export type { ContextManager } from './domain/context/contextManager'
export { createContextManager } from './domain/context/contextManager'
export { defineContextMethod, bufferContextCalls } from './domain/context/defineContextMethod'
export { storeContextManager, removeStorageListeners } from './domain/context/storeContextManager'
export { startAccountContext, buildAccountContextManager } from './domain/contexts/accountContext'
export { startTabContext } from './domain/contexts/tabContext'
export { startGlobalContext, buildGlobalContextManager } from './domain/contexts/globalContext'
export { startUserContext, buildUserContextManager } from './domain/contexts/userContext'
export type { User } from './domain/contexts/userContext'
export type { Account } from './domain/contexts/accountContext'
export type { RumInternalContext } from './domain/contexts/rumInternalContext.type'
export { CustomerDataType, CustomerContextKey, ContextManagerMethod } from './domain/context/contextConstants'
export type { ValueHistory, ValueHistoryEntry } from './tools/valueHistory'
export { createValueHistory, CLEAR_OLD_VALUES_INTERVAL } from './tools/valueHistory'
export { readBytesFromStream } from './tools/readBytesFromStream'
export type { SessionState } from './domain/session/sessionState'
export { SESSION_STORE_KEY } from './domain/session/storeStrategies/sessionStoreStrategy'
export type { MemorySession } from './domain/session/storeStrategies/sessionInMemory'
export { MEMORY_SESSION_STORE_KEY } from './domain/session/storeStrategies/sessionInMemory'
export {
  willSyntheticsInjectRum,
  getSyntheticsContext,
  isSyntheticsTest,
} from './domain/synthetics/syntheticsWorkerValues'
export type { SyntheticsContext } from './domain/synthetics/syntheticsWorkerValues'
export { checkContext } from './domain/context/contextUtils'
export * from './domain/resourceUtils'
export * from './domain/bufferedData'
export * from './tools/utils/polyfills'
export * from './tools/utils/timezone'
export * from './tools/utils/numberUtils'
export * from './tools/utils/byteUtils'
export * from './tools/utils/objectUtils'
export * from './tools/utils/functionUtils'
export * from './tools/serialisation/jsonStringify'
export * from './tools/serialisation/stringify'
export * from './tools/utils/stringUtils'
export * from './tools/matchOption'
export * from './tools/utils/responseUtils'
export type { RawError, RawErrorCause, ErrorWithCause, Csp } from './domain/error/error.types'
export { ErrorHandling, ErrorSource } from './domain/error/error.types'
export * from './domain/deflate'
export * from './domain/connectivity'
export * from './tools/stackTrace/handlingStack'
export * from './domain/tags'
export { correctedChildSampleRate, isSampled, resetSampleDecisionCache, sampleUsingKnuthFactor } from './domain/sampler'
export { startTelemetrySessionContext } from './domain/contexts/telemetrySessionContext'
