import { datadogRum } from '@datadog/browser-rum'

// Initialize RUM without allowedTrackingOrigins to trigger the warning
datadogRum.init({
  applicationId: '1234',
  clientToken: 'pubf2099de38f9c85797d20d64c7d632a69',
  defaultPrivacyLevel: 'allow',
  trackResources: true,
  trackLongTasks: true,
  enableExperimentalFeatures: ['self_regulate_extension'],
  allowUntrustedEvents: true,
  // Only enable session replay for non-extension contexts
  // sessionReplaySampleRate: isExtensionContext ? 0 : 100,
  telemetrySampleRate: 100,
  telemetryUsageSampleRate: 100,
  telemetryConfigurationSampleRate: 100,
})

// Only start session replay for non-extension contexts
// if (!isExtensionContext) {
//   datadogRum.startSessionReplayRecording()
// }

if (window.DD_RUM) {
  console.log('Extension context DD_RUM.version:', window.DD_RUM.version)
} else {
  console.log('Extension context DD_RUM is not defined')
}
