import { includes } from '../../tools/utils'

/**
 * LIMITATION:
 * For NPM setup, this feature flag singleton is shared between RUM and Logs product.
 * This means that an experimental flag set on the RUM product will be set on the Logs product.
 * So keep in mind that in certain configurations, your experimental feature flag may affect other products.
 */

let enabledExperimentalFeatures: string[] = []

export function updateExperimentalFeatures(enabledFeatures: string[] | undefined): void {
  // Safely handle external data
  if (!Array.isArray(enabledFeatures)) {
    return
  }

  enabledFeatures
    .filter((flag) => typeof flag === 'string')
    .forEach((flag: string) => {
      if (!includes(enabledExperimentalFeatures, flag)) enabledExperimentalFeatures.push(flag)
    })
}

export function isExperimentalFeatureEnabled(featureName: string): boolean {
  return includes(enabledExperimentalFeatures, featureName)
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures = []
}

export function getExperimentalFeatures(): string[] {
  return enabledExperimentalFeatures
}
