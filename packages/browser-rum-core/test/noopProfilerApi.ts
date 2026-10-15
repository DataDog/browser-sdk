import { noop } from '@datadog/js-core/util'
import type { ProfilerApi } from '@datadog/browser-rum-core'

export const noopProfilerApi: ProfilerApi = {
  stop: noop,
  onRumStart: noop,
}
