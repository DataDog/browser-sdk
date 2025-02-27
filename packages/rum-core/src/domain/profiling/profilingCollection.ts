import { monitorError, performDraw } from '@datadog/browser-core'

import type { RumConfiguration } from '../configuration'
import type { LifeCycle } from '../lifeCycle'
import type { RumSessionManager } from '../rumSessionManager'
import type { ViewHistory } from '../contexts/viewHistory'
import { lazyLoadProfiler } from './lazyLoadProfiler'
import { isProfilingSupported } from './profilingSupported'
import type { RUMProfiler } from './types'

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
  // Check if Browser is supporting the JS Self-Profiling API
  if (!isProfilingSupported()) {
    return NOOP_STOP
  }

  if (!performDraw(configuration.profilingSampleRate)) {
    // User is not lucky, no profiling!
    return NOOP_STOP
  }

  let profiler: RUMProfiler

  lazyLoadProfiler()
    .then((createRumProfiler) => {
      if (!createRumProfiler) {
        return
      }

      profiler = createRumProfiler({
        configuration,
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
