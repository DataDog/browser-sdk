// Resources — published by collector modules

import type { ErrorCause } from '../error'

interface ConsoleResource {
  api: 'log' | 'debug' | 'info' | 'warn' | 'error'
  message: string
  stack?: string
  error?: Error
  fingerprint?: string
  causes?: ErrorCause[]
}

interface RuntimeErrorResource {
  message: string
  stack?: string
  type?: string
  source: 'source'
  error?: Error
  fingerprint?: string
  causes?: ErrorCause[]
}

interface ReportResource {
  type: string
  message: string
  stack?: string
  subtype?: string
}

interface NetworkRequestResource {
  method: string
  url: string
  status: number
  isAborted: boolean
  startTime: number
  startDate: number
  duration: number
  responseBody?: string
  error?: string
  traceId?: unknown // Identifier from tracing module
  spanId?: unknown
  responseHeaders?: Array<{ name: string; value: string }>
}

// The shared event map used by createSdk
interface SdkEventMap {
  'resource:console': ConsoleResource
  'resource:runtime_error': RuntimeErrorResource
  'resource:report': ReportResource
  'resource:network_request': NetworkRequestResource
  'resource:performance_entry': unknown
  'resource:long_task': unknown
  'resource:long_animation_frame': unknown
  'resource:paint': unknown
  'resource:largest_contentful_paint': unknown
  'resource:layout_shift': unknown
  'resource:performance_event': unknown
  'resource:first_input': unknown
  'resource:navigation_timing': unknown
  'resource:dom_mutation': unknown
  'action:click': unknown
  'action:add_action': unknown
  'action:start_action': unknown
  'action:stop_action': unknown
  'action:start_vital': unknown
  'action:stop_vital': unknown
  'action:add_vital': unknown
  'action:start_resource': unknown
  'action:stop_resource': unknown
  'signal:network_request_start': unknown
  'observation:resource': unknown
  'observation:error': unknown
  'observation:long_task': unknown
  'observation:action': unknown
  'observation:vital': unknown
  'signal:session_expired': void
  'signal:session_renewed': void
  [key: string]: unknown
}

export type { ConsoleResource, RuntimeErrorResource, ReportResource, NetworkRequestResource, SdkEventMap }
export type { ErrorCause } from '../error'
