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
  FEATURE_FLAGS = 'feature_flags',
  RESOURCE_PAGE_STATES = 'resource_page_states',
  COLLECT_FLUSH_REASON = 'collect_flush_reason',
  ZERO_LCP_TELEMETRY = 'zero_lcp_telemetry',
  DISABLE_REPLAY_INLINE_CSS = 'disable_replay_inline_css',
}

const enabledExperimentalFeatures: Set<ExperimentalFeature> = new Set()

export function addExperimentalFeatures(enabledFeatures: ExperimentalFeature[]): void {
  enabledFeatures.forEach((flag) => {
    enabledExperimentalFeatures.add(flag)
  })
}

export function isExperimentalFeatureEnabled(featureName: ExperimentalFeature): boolean {
  return enabledExperimentalFeatures.has(featureName)
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures.clear()
}

export function getExperimentalFeatures(): Set<ExperimentalFeature> {
  return enabledExperimentalFeatures
}
