/**
 * LIMITATION:
 * For NPM setup, this feature flag singleton is shared between RUM and Logs product.
 * This means that an experimental flag set on the RUM product will be set on the Logs product.
 * So keep in mind that in certain configurations, your experimental feature flag may affect other products.
 */

import { performDraw } from '../../tools/utils'

let enabledExperimentalFeatures: Set<string>
let sampledExperimentalFeatures: Map<string, boolean>

export function updateExperimentalFeatures(enabledFeatures: string[] | undefined): void {
  // Safely handle external data
  if (!Array.isArray(enabledFeatures)) {
    return
  }

  if (!enabledExperimentalFeatures) {
    enabledExperimentalFeatures = new Set(enabledFeatures)
  }

  enabledFeatures
    .filter((flag) => typeof flag === 'string')
    .forEach((flag: string) => {
      enabledExperimentalFeatures.add(flag)
    })
}

export function isExperimentalFeatureEnabled(featureName: string): boolean {
  return (
    !!enabledExperimentalFeatures &&
    enabledExperimentalFeatures.has(featureName) &&
    isExperimentalFeatureSampled(featureName)
  )
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures = new Set()
  sampledExperimentalFeatures = new Map()
}

export function sampleExperimentalFeature(featureName: string, sampleRate: number): void {
  if (!sampledExperimentalFeatures) {
    sampledExperimentalFeatures = new Map()
  }
  sampledExperimentalFeatures.set(featureName, performDraw(sampleRate))
}

function isExperimentalFeatureSampled(featureName: string): boolean {
  return (
    !sampledExperimentalFeatures ||
    !sampledExperimentalFeatures.has(featureName) ||
    sampledExperimentalFeatures.get(featureName)!
  )
}
