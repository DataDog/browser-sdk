import type { InitConfiguration } from './configuration'

function isSampleRate(value: number | undefined): boolean {
  return value === undefined || (value >= 0 && value <= 100)
}

function validateConfiguration(init: InitConfiguration): boolean {
  if (!init.clientToken || !init.site) {
    return false
  }
  if (
    !isSampleRate(init.sessionSampleRate) ||
    !isSampleRate(init.telemetrySampleRate) ||
    !isSampleRate(init.telemetryConfigurationSampleRate) ||
    !isSampleRate(init.telemetryUsageSampleRate)
  ) {
    return false
  }
  return true
}

export { validateConfiguration }
