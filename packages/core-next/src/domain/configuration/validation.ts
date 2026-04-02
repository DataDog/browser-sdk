import type { InitConfiguration } from '.'

function isSampleRate(value: number | undefined): boolean {
  return value === undefined || (value >= 0 && value <= 100)
}

function validate(init: InitConfiguration): boolean {
  if (!init.clientToken) {
    console.error('clientToken is required')
    return false
  }
  if (!init.site) {
    console.error('site is required')
    return false
  }
  if (!isSampleRate(init.sessionSampleRate)) {
    console.warn('sessionSampleRate must be between 0 and 100')
    return false
  }
  if (!isSampleRate(init.telemetrySampleRate)) {
    console.warn('telemetrySampleRate must be between 0 and 100')
    return false
  }
  if (!isSampleRate(init.telemetryConfigurationSampleRate)) {
    console.warn('telemetryConfigurationSampleRate must be between 0 and 100')
    return false
  }
  if (!isSampleRate(init.telemetryUsageSampleRate)) {
    console.warn('telemetryUsageSampleRate must be between 0 and 100')
    return false
  }
  return true
}

export { validate }
