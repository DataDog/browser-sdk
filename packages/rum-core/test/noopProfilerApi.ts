import { noop } from '@datadog/browser-core'
import type { ProfilerApi } from '@datadog/browser-rum-core'

export const noopProfilerApi: ProfilerApi = {
  stop: noop,
  onRumStart: noop,
}
