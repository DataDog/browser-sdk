import type { TimeStamp } from '@datadog/browser-core'

export interface RawExposureEvent {
  date: TimeStamp
  exposure: {
    flag_key: string
    flag_value: any
    flag_default_value?: any
    evaluation_context?: Record<string, any>
    targeting_key?: string
    reason?: string
    rule_id?: string
  }
}

export interface CommonContext {
  view: {
    referrer: string
    url: string
  }
  user: Record<string, any>
  application: {
    id: string
  }
} 