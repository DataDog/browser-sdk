// Session stores
export { MemoryStore } from './domain/session'
export { CookieStore } from './domain/session'
export { LocalStorageStore } from './domain/session'
export { selectStore } from './domain/session'
export type { SelectStoreOptions } from './domain/session'

// Transport
export type { Encoder, EncoderResult } from './domain/transport'
export { createIdentityEncoder, createDeflateEncoder } from './domain/transport'
export type { Payload, RetryInfo, HttpRequest, HttpRequestOptions } from './domain/transport'
export { createHttpRequest } from './domain/transport'
export type { DatadogEventBridge } from './domain/transport'
export { BridgeCapability, getEventBridge, canUseEventBridge, bridgeSupports } from './domain/transport'
export type { EndpointBuilder, EndpointBuilderOptions, TrackType } from './domain/transport'
export { createEndpointBuilder, buildIntakeHost, isIntakeUrl, INTAKE_SITE_US1 } from './domain/transport'

// Browser utilities
export { getCookie, setCookie, deleteCookie, areCookiesAuthorized } from './browser/cookie'
export type { CookieOptions } from './browser/cookie'
