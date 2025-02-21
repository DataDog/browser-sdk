import { monitorError, performDraw } from '@datadog/browser-core'

import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import type { RumSessionManager } from '../rumSessionManager'
import type { ViewHistory } from '../contexts/viewHistory'
import type { createRumProfiler as CreateRumProfilerType } from './profiler'
import { lazyLoadProfiler } from './lazyLoadProfiler'

const NOOP_STOP = {
  stop: () => {
    /* Nothing to stop */
  },
}

export const startProfilingCollection = (
  configuration: RumConfiguration,
  lifeCycle: LifeCycle,
  session: RumSessionManager,
  isLongAnimationFrameEnabled: boolean,
  viewHistory: ViewHistory
) => {
  // TODO Deobfuscation / SCI

  const sampleRate = configuration.profilingSampleRate
  if (!performDraw(sampleRate)) {
    // User is not lucky, no profiling!
    return NOOP_STOP
  }

  const endpointBuilder = configuration.profilingEndpointBuilder

  let profiler: ReturnType<typeof CreateRumProfilerType>

  lazyLoadProfiler()
    .then((createRumProfiler) => {
      if (!createRumProfiler) {
        return
      }

      profiler = createRumProfiler({
        configuration,
        endpointBuilder,
        isLongAnimationFrameEnabled,
        lifeCycle,
        session,
      })

      profiler.start(viewHistory?.findView()?.id)
    })
    .catch(monitorError)

  return {
    stop: () => {
      profiler?.stop()
    },
  }
}
