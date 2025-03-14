import type { ProfilerApi } from '@datadog/browser-rum-core'
import { noop } from '@datadog/browser-core'

export const noopProfilerApi: ProfilerApi = {
  stop: noop,
  onRumStart: noop,
}
