const DEFAULTS = {
  enabled: true,
  sessionSampleRate: 100,
  site: 'datadoghq.com',
  telemetrySampleRate: 20,
  telemetryConfigurationSampleRate: 5,
  telemetryUsageSampleRate: 5,
} as const

export { DEFAULTS }
