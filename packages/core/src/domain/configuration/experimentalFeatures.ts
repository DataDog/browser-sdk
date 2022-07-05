/**
 * LIMITATION:
 * For NPM setup, this feature flag singleton is shared between RUM and Logs product.
 * This means that an experimental flag set on the RUM product will be set on the Logs product.
 * So keep in mind that in certain configurations, your experimental feature flag may affect other products.
 */

let enabledExperimentalFeatures: Set<string> | undefined

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
      enabledExperimentalFeatures!.add(flag)
    })
}

export function isExperimentalFeatureEnabled(featureName: string): boolean {
  return !!enabledExperimentalFeatures && enabledExperimentalFeatures.has(featureName)
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures = new Set()
}

export function getExperimentalFeatures(): Set<string> {
  return enabledExperimentalFeatures || new Set()
}
