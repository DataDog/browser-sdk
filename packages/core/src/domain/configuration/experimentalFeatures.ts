let enabledExperimentalFeatures: Set<string>

export function setEnabledExperimentalFeatures(enabledFeatures: string[]): void {
  enabledExperimentalFeatures = new Set(enabledFeatures)
}

export function isEnabledExperimentalFeature(featureName: string): boolean {
  return enabledExperimentalFeatures.has(featureName)
}
