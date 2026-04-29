function featureFlagEnricher() {
  const flags = new Map<string, unknown>()

  const enrich = {
    name: 'featureFlag',
    transform(data: Record<string, unknown>) {
      if (flags.size === 0) return data
      return {
        ...data,
        feature_flags: Object.fromEntries(flags),
      }
    },
  }

  return {
    enricher: enrich,
    addEvaluation(key: string, value: unknown) {
      flags.set(key, value)
    },
    clear() {
      flags.clear()
    },
  }
}

export { featureFlagEnricher }
