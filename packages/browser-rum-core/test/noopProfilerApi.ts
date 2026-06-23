import { noop } from '@openobserve/browser-core'
import type { ProfilerApi } from '@openobserve/browser-rum-core'

export const noopProfilerApi: ProfilerApi = {
  stop: noop,
  onRumStart: noop,
}
