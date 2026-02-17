export const DoNotTrackState = {
  ENABLED: '1',
  DISABLED: '0',
} as const

export function isTrackingAllowedByBrowser() {
  return navigator.doNotTrack !== DoNotTrackState.ENABLED
}