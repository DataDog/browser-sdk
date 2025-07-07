import type { Context } from '@datadog/browser-core'
import type { CommonContext } from '../../rawExposureEvent.types'

export function buildCommonContext(): CommonContext {
  return {
    view: {
      referrer: document.referrer,
      url: window.location.href,
    },
    user: {},
    application: {
      id: 'unknown',
    },
  }
} 