let enabledExperimentalFeatures: Set<string>

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
  return !!enabledExperimentalFeatures && enabledExperimentalFeatures.has(featureName)
}

export function resetExperimentalFeatures(): void {
  enabledExperimentalFeatures = new Set()
}
