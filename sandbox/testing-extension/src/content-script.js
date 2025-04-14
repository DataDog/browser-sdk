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
