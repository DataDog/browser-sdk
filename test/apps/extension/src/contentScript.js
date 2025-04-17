import { datadogRum } from '@datadog/browser-rum'

datadogRum.init({
  applicationId: 'xxx',
  clientToken: 'xxx',
  site: 'xxx',
  service: 'benoit-test',
  env: 'dev',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 0,
  defaultPrivacyLevel: 'mask-user-input',
})

datadogRum.startSessionReplayRecording()

if (window.DD_RUM) {
  console.log('Extension context DD_RUM.version:', window.DD_RUM.version)
} else {
  console.log('Extension context DD_RUM is not defined')
}
