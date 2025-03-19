import { datadogRum } from '@datadog/browser-rum'

export const init_rum_extensions = () => {
  datadogRum.init({
    applicationId: 'xxx',
    clientToken: 'xxx',
    site: 'xxx' as any,
    service: 'benoit-test',
    env: 'dev',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: 'mask-user-input',
    sessionPersistence: 'local-storage'
  });

  datadogRum.startSessionReplayRecording();
}