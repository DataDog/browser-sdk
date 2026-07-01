export type {
  TrackType,
  TransportApiType,
  TransportSource,
  EndpointBuilder,
  BuildEndpointUrlOptions,
  ProxyFn,
  TransportRetryInfo,
  EndpointPayload,
} from '../transport/endpointBuilder'
export { createEndpointBuilder, createReplicaEndpointBuilder, buildEndpointUrl } from '../transport/endpointBuilder'
export type { Encoder, EncoderResult } from '../transport/encoder'
export { createIdentityEncoder } from '../transport/encoder'
export type { Payload, HttpResponse, BandwidthStats, HttpRequestEvent } from '../transport/payload'
export type { HttpRequest, SendStrategy, SendOnExitStrategy } from '../transport/httpRequest'
export { createHttpRequest } from '../transport/httpRequest'
export type { Batch } from '../transport/batch'
export { createBatch, MESSAGE_BYTES_LIMIT } from '../transport/batch'
export { RECOMMENDED_REQUEST_BYTES_LIMIT } from '../transport/payload'
export { PageExitReason, isPageExitReason, FLUSH_DURATION_LIMIT } from '../transport/flushController'
export type { PageMayExitEvent, UrgentFlushReason, FlushReason, FlushEvent } from '../transport/flushController'

export type { Site } from '../transport/intakeSites'
export {
  INTAKE_SITE_STAGING,
  INTAKE_SITE_US1,
  INTAKE_SITE_EU1,
  INTAKE_SITE_US1_FED,
  INTAKE_SITE_US2_FED,
  INTAKE_URL_PARAMETERS,
  isIntakeUrl,
} from '../transport/intakeSites'
