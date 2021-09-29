let enabledExperimentalFeatures: Set<string>

export function setEnabledExperimentalFeatures(enabledFeatures: string[]): void {
  enabledExperimentalFeatures = new Set(enabledFeatures)
}

export function isEnabledExperimentalFeatures(featureName: string): boolean {
  return enabledExperimentalFeatures.has(featureName)
}
