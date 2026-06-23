import { noop } from '@openobserve/browser-core'
import type { ProfilerApi } from '@openobserve/browser-rum-core'

export function makeProfilerApiStub(): ProfilerApi {
  return {
    onRumStart: noop,
    stop: noop,
  }
}
