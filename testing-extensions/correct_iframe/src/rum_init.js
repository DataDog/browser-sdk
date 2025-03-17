import { datadogRum } from '@datadog/browser-rum';

console.log('[Extension - Popup] Initializing RUM only in extension.');

datadogRum.init({
    applicationId: 'bd3472ea-efc2-45e1-8dff-be4cea9429b3',
    clientToken: 'pub7216f8a2d1091e263c95c1205882474e',
    site: 'datad0g.com',
    service: 'benoit-test-1',
    env: 'dev',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: 'mask-user-input',
    sessionPersistence: 'local-storage'
});

datadogRum.startSessionReplayRecording();