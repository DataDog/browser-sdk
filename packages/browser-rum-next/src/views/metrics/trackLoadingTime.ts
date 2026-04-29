import type { ViewLoadingType } from '../types'

export interface LoadingTimeTracker {
  setLoadEvent(time: number): void
  setActivityEnd(time: number): void
  get(): number | undefined
}

export function trackLoadingTime(loadingType: ViewLoadingType): LoadingTimeTracker {
  let loadEventTime: number | undefined
  let activityEndTime: number | undefined

  return {
    setLoadEvent(time: number) {
      loadEventTime = time
    },
    setActivityEnd(time: number) {
      activityEndTime = time
    },
    get() {
      if (loadingType === 'initial_load') {
        return loadEventTime
      }
      return activityEndTime
    },
  }
}
