import { noop } from '@datadog/browser-core'
import type { ProfilerApi } from '@datadog/browser-rum-core'

export function makeProfilerApiStub() :ProfilerApi {
  return {
    onRumStart: noop,
    stop: noop,
  }
}