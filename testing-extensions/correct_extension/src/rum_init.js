import { datadogRum } from '@datadog/browser-rum';

console.log('[Extension - Popup] Initializing RUM only in extension.');

datadogRum.init({
    applicationId: 'xxx',
    clientToken: 'xxx',
    site: 'xxx',
    service: 'extension-test',
    env: 'extension',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: 'mask-user-input',
});

datadogRum.startSessionReplayRecording();