/**
 * LIMITATION:
 * For NPM setup, this feature flag singleton is shared between RUM and Logs product.
 * This means that an experimental flag set on the RUM product will be set on the Logs product.
 * So keep in mind that in certain configurations, your experimental feature flag may affect other products.
 *
 * FORMAT:
 * All feature flags should be snake_cased
 */
// We want to use a real enum (i.e. not a const enum) here, to be able to check whether an arbitrary
// string is an expected feature flag
// eslint-disable-next-line no-restricted-syntax
export enum ExperimentalFeature {
  PAGEHIDE = 'pagehide',
  SHADOW_DOM_DEBUG = 'shadow_dom_debug',
  FEATURE_FLAGS = 'feature_flags',
  RESOURCE_DURATIONS = 'resource_durations',
  RESOURCE_PAGE_STATES = 'resource_page_states',
  CLICKMAP = 'clickmap',
  COLLECT_FLUSH_REASON = 'collect_flush_reason',
  SANITIZE_INPUTS = 'sanitize_inputs',
}

let enabledExperimentalFeatures: Set<ExperimentalFeature> | undefined

export function addExperimentalFeatures(enabledFeatures: ExperimentalFeature[] | undefined): void {
  // Safely handle external data
  if (!Array.isArray(enabledFeatures)) {
    return
  }

  if (!enabledExperimentalFeatures) {
    enabledExperimentalFeatures = new Set(enabledFeatures)
  }

  enabledFeatures.forEach((flag) => {
    enabledExperimentalFeatures!.add(flag)
  })
}

export function isExperimentalFeatureEnabled(featureName: ExperimentalFeature): boolean {
  return !!enabledExperimentalFeatures && enabledExperimentalFeatures.has(featureName)
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures = new Set()
}

export function getExperimentalFeatures(): Set<string> {
  return enabledExperimentalFeatures || new Set()
}
