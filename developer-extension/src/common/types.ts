export interface BackgroundActions {
  getStore: void
  setStore: Partial<Store>
  flushEvents: void
  endSession: void
  getConfig: 'rum' | 'logs'
  configReceived: any
}

export interface PopupActions {
  newStore: Store
}

export interface Store {
  devServerStatus: 'unavailable' | 'checking' | 'available'
  useDevBundles: boolean
  useRumSlim: boolean
  blockIntakeRequests: boolean
  local: {
    [tabId: number]: LocalStore
  }
}

export interface LocalStore {
  rumConfig: any
  logsConfig: any
}
