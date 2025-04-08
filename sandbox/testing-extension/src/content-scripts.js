import { datadogRum } from '@datadog/browser-rum'

console.log('Content script loaded. Initializing RUM...')

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

console.log('[Testing] Running test code. ------------------------------------')

const isolatedErrorStack = new Error().stack || ''
console.log('>>> [Main] Error stack:', isolatedErrorStack)

const hasExtensionURLIsolated = isolatedErrorStack.includes('chrome-extension://')
console.log('hasExtensionURL:', hasExtensionURLIsolated)

console.log('Current URL:', window.location.href)
console.log('Document title:', document.title)
console.log('Extension ID (if available):', chrome.runtime.id || 'Unknown')

datadogRum.startSessionReplayRecording()
