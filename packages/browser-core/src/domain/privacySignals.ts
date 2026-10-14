import { globalObject } from '@datadog/js-core/util'

export const DoNotTrackState = {
  ENABLED: '1',
  DISABLED: '0',
} as const

/**
 * Checks browser privacy signals to determine whether tracking is allowed.
 *
 * Global Privacy Control (GPC) is checked first, as it is a legally binding signal in several
 * jurisdictions (CPRA, CPA, CTDPA). Do Not Track (DNT) is checked as a fallback trust signal.
 */
export function isTrackingAllowedByPrivacySignals() {
  const { navigator } = globalObject
  if (navigator?.globalPrivacyControl) {
    return false
  }
  return navigator?.doNotTrack !== DoNotTrackState.ENABLED
}
