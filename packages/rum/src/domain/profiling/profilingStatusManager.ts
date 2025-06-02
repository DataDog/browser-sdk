import type { ProfilingStatus } from '@datadog/browser-rum-core'

export interface ProfilingStatusManager {
  setProfilingStatus: (next: ProfilingStatus) => void
  getProfilingStatus: () => ProfilingStatus | undefined
}

export const createProfilingStatusManager = (): ProfilingStatusManager => {
  let profilingStatus: ProfilingStatus | undefined

  const setProfilingStatus = (next: ProfilingStatus) => {
    profilingStatus = next
  }

  const getProfilingStatus = () => profilingStatus

  return {
    setProfilingStatus,
    getProfilingStatus,
  }
}
