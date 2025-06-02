import type { ProfilingStatus } from '@datadog/browser-rum-core'

export interface ProfilingStatusManager {
  setProfilingStatus: (next: ProfilingStatus) => void
  getProfilingStatus: () => ProfilingStatus
}

export const createProfilingStatusManager = (initialStatus: ProfilingStatus): ProfilingStatusManager => {
  let currentStatus: ProfilingStatus = initialStatus

  const setProfilingStatus = (next: ProfilingStatus) => {
    currentStatus = next
  }

  const getProfilingStatus = () => currentStatus

  return {
    setProfilingStatus,
    getProfilingStatus,
  }
}
