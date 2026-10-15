import { noop } from '@datadog/js-core/util'
import type { ProfilerApi } from '@datadog/browser-rum-core'

export function makeProfilerApiStub(): ProfilerApi {
  return {
    onRumStart: noop,
    stop: noop,
  }
}
