// Inlined from @datadog/browser-core to avoid external dependency
// eslint-disable-next-line no-restricted-syntax
enum ExperimentalFeature {
  USE_CHANGE_RECORDS = 'use_change_records',
  USE_INCREMENTAL_CHANGE_RECORDS = 'use_incremental_change_records',
}

const enabledExperimentalFeatures: Set<ExperimentalFeature> = new Set()

function isExperimentalFeatureEnabled(featureName: ExperimentalFeature): boolean {
  return enabledExperimentalFeatures.has(featureName)
}

export function isFullSnapshotChangeRecordsEnabled(): boolean {
  // We don't want to have to support the case where full snapshots use the old format and
  // incremental snapshots use the new one, so we should generate full snapshot Change
  // records if either feature flag is enabled.
  return (
    isExperimentalFeatureEnabled(ExperimentalFeature.USE_CHANGE_RECORDS) ||
    isExperimentalFeatureEnabled(ExperimentalFeature.USE_INCREMENTAL_CHANGE_RECORDS)
  )
}

export function isIncrementalSnapshotChangeRecordsEnabled(): boolean {
  return isExperimentalFeatureEnabled(ExperimentalFeature.USE_INCREMENTAL_CHANGE_RECORDS)
}
