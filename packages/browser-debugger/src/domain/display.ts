import type { Display } from '@datadog/browser-core'
import { createDisplay } from '@datadog/browser-core'

export const DEBUGGER_DISPLAY_PREFIX = 'Datadog Debugger SDK:'
// eslint-disable-next-line local-rules/disallow-side-effects
export const display: Display = createDisplay(DEBUGGER_DISPLAY_PREFIX)
