// Resources — published by collector modules

interface ConsoleResource {
  api: 'log' | 'debug' | 'info' | 'warn' | 'error'
  message: string
  stack?: string
  error?: Error
}

interface RuntimeErrorResource {
  message: string
  stack?: string
  type?: string
  source: 'source'
  causes?: Array<{ message: string; type?: string; stack?: string }>
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
  duration: number
  responseBody?: string
  error?: string
}

// The shared event map used by createSdk
interface SdkEventMap {
  'resource:console': ConsoleResource
  'resource:runtime_error': RuntimeErrorResource
  'resource:report': ReportResource
  'resource:network_request': NetworkRequestResource
  'signal:session_expired': void
  'signal:session_renewed': void
  [key: string]: unknown
}

export type { ConsoleResource, RuntimeErrorResource, ReportResource, NetworkRequestResource, SdkEventMap }
