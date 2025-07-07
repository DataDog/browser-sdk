import type { Context } from '@datadog/browser-core'

export interface ExposureEvent extends Context {
  date: number
  service: string
  version?: string
  env?: string
  
  // Exposure-specific fields
  exposure: {
    flag_key: string
    flag_value: any
    flag_default_value?: any
    evaluation_context?: Record<string, any>
    targeting_key?: string
    reason?: string
    rule_id?: string
  }
  
  // Session information
  session_id?: string
  session?: {
    id: string
  }
  
  // View information
  view?: {
    id: string
    url: string
    referrer?: string
  }
  
  // User information
  usr?: {
    id?: string
    name?: string
    email?: string
    anonymous_id?: string
  }
  
  // Application information
  application?: {
    id: string
  }
  
  // Internal properties
  _dd: {
    format_version: 2
    browser_sdk_version?: string
  }
} 