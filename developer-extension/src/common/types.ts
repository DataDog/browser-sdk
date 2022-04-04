export interface BackgroundActions {
  getStore: void
  setStore: Partial<Store>
  flushEvents: void
  endSession: void
}

export interface PopupActions {
  newStore: Store
}

export interface Store {
  devServerStatus: 'unavailable' | 'checking' | 'available'
  useDevBundles: boolean
  useRumSlim: boolean
  blockIntakeRequests: boolean
}
