/**
 * LIMITATION:
 * For NPM setup, this feature flag singleton is shared between RUM and Logs product.
 * This means that an experimental flag set on the RUM product will be set on the Logs product.
 * So keep in mind that in certain configurations, your experimental feature flag may affect other products.
 */

import { performDraw } from '../../tools/utils'

let enabledExperimentalFeatures: Set<string>

export function updateExperimentalFeatures(
  enabledFeatures: Array<string | { [name: string]: number }> | undefined
): void {
  // Safely handle external data
  if (!Array.isArray(enabledFeatures)) {
    return
  }

  if (!enabledExperimentalFeatures) {
    enabledExperimentalFeatures = new Set()
  }

  for (const feature of enabledFeatures) {
    if (typeof feature === 'string') {
      enabledExperimentalFeatures.add(feature)
    } else {
      for (const featureName in feature) {
        if (Object.prototype.hasOwnProperty.call(feature, featureName) && performDraw(feature[featureName])) {
          enabledExperimentalFeatures.add(featureName)
        }
      }
    }
  }
}

export function isExperimentalFeatureEnabled(featureName: string): boolean {
  return !!enabledExperimentalFeatures && enabledExperimentalFeatures.has(featureName)
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures = new Set()
}
