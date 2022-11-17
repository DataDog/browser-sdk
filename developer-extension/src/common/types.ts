export interface BackgroundActions {
  getStore: void
  setStore: Partial<Store>
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
