import { HookNames } from '@datadog/browser-core'
import type { DefaultRumEventAttributes, Hooks } from '../hooks'
import type { ProfilerApi } from '../../boot/rumPublicApi'
import type { ProfilingSchema } from '../../rumEvent.types'

export interface ProfilingContextManager {
  setProfilingContext: (next: Partial<ProfilingSchema>) => void
  getProfilingContext: () => ProfilingSchema
}

export const createProfilingContextManager = (initialStatus: ProfilingSchema['status']): ProfilingContextManager => {
  let currentContext: ProfilingSchema = {
    status: initialStatus,
  }

  const setProfilingContext = (partialContext: Partial<ProfilingSchema>) => {
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
      profiling: profilerApi.getProfilingContext(),
    })
  )
}
