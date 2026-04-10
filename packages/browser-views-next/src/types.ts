export type ViewLoadingType = 'initial_load' | 'route_change' | 'bf_cache'

export interface NavigationResource {
  url: string
  startTime: number
  startDate: number
  referrer: string
  loadingType: ViewLoadingType
  name?: string
}

export interface StartViewAction {
  url: string
  startTime: number
  startDate: number
  referrer: string
  loadingType: 'route_change'
  name?: string
}

export interface ViewObservation {
  id: string
  url: string
  referrer: string
  loadingType: ViewLoadingType
  startTime: number
  startDate: number
  date: number
  name?: string
}

export interface ViewChangedSignal {
  viewId: string
}

// Extend the shared pipeline event map
declare module '@datadog/core-next' {
  interface SdkEventMap {
    'resource:navigation': NavigationResource
    'action:start_view': StartViewAction
    'observation:view': ViewObservation
    'signal:view_changed': ViewChangedSignal
  }
}
