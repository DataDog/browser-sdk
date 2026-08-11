import { createDisplay } from '@datadog/js-core/util'
import type { Display } from '@datadog/js-core/util'

export const DEBUGGER_DISPLAY_PREFIX = 'Datadog Debugger SDK:'
// eslint-disable-next-line local-rules/disallow-side-effects
export const display: Display = createDisplay(DEBUGGER_DISPLAY_PREFIX)
