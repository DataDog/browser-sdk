import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: '37fe52bf-b3d5-4ac7-ad9b-44882d479ec8',
  clientToken: 'pubf2099de38f9c85797d20d64c7d632a69',
  defaultPrivacyLevel: 'allow',
  trackResources: true,
  trackLongTasks: true,
  enableExperimentalFeatures: ['self_regulate_extension'],
  allowUntrustedEvents: true,
  // Force All sample rates to 100% to avoid flakiness
  sessionReplaySampleRate: 100,
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
})

datadogRum.startSessionReplayRecording()

if (window.DD_RUM) {
  console.log('Extension context DD_RUM.version:', window.DD_RUM.version)
} else {
  console.log('Extension context DD_RUM is not defined')
}
