import { datadogRum } from '@datadog/browser-rum'

console.log("initiated")

datadogRum.init({
  applicationId: 'bd3472ea-efc2-45e1-8dff-be4cea9429b3',
  clientToken: 'pub7216f8a2d1091e263c95c1205882474e',
  site: 'datad0g.com',
  service: 'benoit-test',
  env: 'dev',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 100,
  defaultPrivacyLevel: 'mask-user-input',
  sessionPersistence: 'local-storage',
  beforeSend: event => {
    console.log('RUM beforeSend event:', event);
  }
});

console.log('RUM extensions initialized');
datadogRum.startSessionReplayRecording();

// Instead of window and document objects, use service worker context
console.log("Service worker context:", self.location);
console.log("Runtime ID:", chrome.runtime.id);

// Log test information in service worker:
console.log('[Testing] Running test code in service worker. ------------------------------------');

const isolatedErrorStack = new Error().stack || "";
console.log(">>> [Main] Error stack:", isolatedErrorStack);

const hasExtensionURLIsolated = isolatedErrorStack.includes("chrome-extension://");
console.log("hasExtensionURL:", hasExtensionURLIsolated);

// Use self instead of window
console.log("Current URL:", self.location.href);
console.log("Extension ID:", chrome.runtime.id || "Unknown");