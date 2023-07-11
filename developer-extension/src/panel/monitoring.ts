import { datadogRum } from '@datadog/browser-rum'
import packageJson from '../../package.json'

export function initMonitoring() {
  datadogRum.init({
    applicationId: '235202fa-3da1-4aeb-abc4-d01b10ca1539',
    clientToken: 'pub74fd472504982beb427b647893758040',
    site: 'datadoghq.com',
    service: 'browser-sdk-developer-extension',
    env: 'prod',
    version: packageJson.version,
    allowFallbackToLocalStorage: true,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    telemetrySampleRate: 100,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'mask-user-input',
  })
  datadogRum.startSessionReplayRecording()
}
