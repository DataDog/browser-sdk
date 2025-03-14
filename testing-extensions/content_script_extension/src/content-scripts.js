import { datadogRum } from '@datadog/browser-rum';

console.log('Content script loaded. Initializing RUM...');

datadogRum.init({
    applicationId: 'xxx',
    clientToken: 'xxx',
    site: 'xxx',
    service: 'benoit-test-1',
    env: 'dev',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    defaultPrivacyLevel: 'mask-user-input',
});

datadogRum.setUser({
    id: '1234',
    name: 'Beltran',
    email: 'beltran@mail.com'
});

// Log test information in the isolated world:
console.log('[Testing] Running test code. ------------------------------------');

const isolatedErrorStack = new Error().stack || "";
console.log(">>> [Main] Error stack:", isolatedErrorStack);

const hasExtensionURLIsolated = isolatedErrorStack.includes("chrome-extension://");
console.log("hasExtensionURL:", hasExtensionURLIsolated);

console.log("Current URL:", window.location.href);
console.log("Document title:", document.title);
console.log("Extension ID (if available):", chrome.runtime.id || "Unknown");

// window.addEventListener("error", (event) => {
//     console.log("[Testing] Uncaught error:", event.error);
// });
//
// window.addEventListener("unhandledrejection", (event) => {
//     console.log("[Testing] Unhandled Promise Rejection:", event.reason);
// });

datadogRum.startSessionReplayRecording();
