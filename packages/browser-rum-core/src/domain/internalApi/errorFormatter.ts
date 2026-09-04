// Free formatter function, as described in /rum-thin-layer.ts: formats an error the RUM way so
// callers (ex: the react / vue plugins, the public API) don't have to reimplement RUM formatting
// rules. Deferred phase 1 item, introduced in phase 4 when the react plugin needed it.

import { ErrorHandling, computeRawError } from '@datadog/browser-core'
import type { ClocksState } from '@datadog/js-core/time'
import { clocksNow } from '@datadog/js-core/time'
import type { ErrorHandling as ErrorHandlingType, ErrorSource, NonErrorPrefix, RawError } from '@datadog/browser-core'
import type { AddEventOptions } from './rumInternalApi.types'

export interface FormatErrorEventOptions {
  // The value the event is derived from
  originalError: unknown
  handlingStack?: string
  componentStack?: string
  source: ErrorSource
  handling?: ErrorHandlingType
  nonErrorPrefix: NonErrorPrefix
  startClocks?: ClocksState
}

// Computes the raw error (via browser-core's computeRawError) and formats it as the error base
// event (kickoff + raw event fields, without the event id — the internal API owns it). Also
// returns the raw error, so callers can build the event baggage (startClocks — the raw error
// itself rides domainContext).
export function formatErrorEvent(options: FormatErrorEventOptions): {
  baseRumEvent: AddEventOptions['baseRumEvent']
  rawError: RawError
} {
  const startClocks = options.startClocks ?? clocksNow()
  const rawError = computeRawError({
    originalError: options.originalError,
    handlingStack: options.handlingStack,
    componentStack: options.componentStack,
    startClocks,
    nonErrorPrefix: options.nonErrorPrefix,
    source: options.source,
    handling: options.handling ?? ErrorHandling.HANDLED,
  })
  return {
    baseRumEvent: {
      type: 'error',
      error: {
        message: rawError.message,
        source: rawError.source,
        stack: rawError.stack,
        handling_stack: rawError.handlingStack,
        component_stack: rawError.componentStack,
        type: rawError.type,
        handling: rawError.handling,
        causes: rawError.causes,
        fingerprint: rawError.fingerprint,
        csp: rawError.csp,
      },
      _dd: { debug_ids: rawError.debugIds },
    } as unknown as AddEventOptions['baseRumEvent'],
    rawError,
  }
}
