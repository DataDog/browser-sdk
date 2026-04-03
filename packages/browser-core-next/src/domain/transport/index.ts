export type { Encoder, EncoderResult } from './encoder'
export { createIdentityEncoder, createDeflateEncoder } from './encoder'

export type { Payload, RetryInfo, HttpRequest, HttpRequestOptions } from './httpRequest'
export { createHttpRequest } from './httpRequest'

export type { DatadogEventBridge } from './eventBridge'
export { BridgeCapability, getEventBridge, canUseEventBridge, bridgeSupports } from './eventBridge'
