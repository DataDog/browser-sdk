import { HookNames } from '@datadog/browser-core'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import type { ProfilerApi } from '../../boot/rumPublicApi'
import type { ProfilingInternalContextSchema } from '../../rumEvent.types'

export interface ProfilingContextManager {
  setProfilingContext: (next: Partial<ProfilingInternalContextSchema> | undefined) => void
  getProfilingContext: () => ProfilingInternalContextSchema | undefined
}

export const createProfilingContextManager = (
  initialStatus: NonNullable<ProfilingInternalContextSchema['status']>
): ProfilingContextManager => {
  let currentContext: ProfilingInternalContextSchema | undefined = {
    status: initialStatus,
  }

  const setProfilingContext = (partialContext: Partial<ProfilingInternalContextSchema> | undefined) => {
    currentContext = { ...currentContext, ...partialContext }
  }

  const getProfilingContext = () => currentContext

  return {
    setProfilingContext,
    getProfilingContext,
  }
}

export const startProfilingContext = (hooks: Hooks, profilerApi: ProfilerApi) => {
  hooks.register(
    HookNames.Assemble,
    ({ eventType }): DefaultRumEventAttributes => ({
      type: eventType,
      _dd: {
        profiling: profilerApi.getProfilingContext(),
      },
    })
  )
}
