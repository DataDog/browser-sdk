let enabledExperimentalFeatures: Set<string>

export function updateEnabledExperimentalFeatures(enabledFeatures: string[]): void {
  if (!enabledExperimentalFeatures) {
    enabledExperimentalFeatures = new Set(enabledFeatures)
  } else {
    enabledFeatures.forEach((flag) => enabledExperimentalFeatures.add(flag))
  }
}

export function isEnabledExperimentalFeature(featureName: string): boolean {
  return enabledExperimentalFeatures && enabledExperimentalFeatures.has(featureName)
}
