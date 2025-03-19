import { datadogRum } from '@datadog/browser-rum';

console.log('Content script loaded. Initializing RUM...');

// Initialize RUM
// try {
//   datadogRum.init({
//       applicationId: 'bd3472ea-efc2-45e1-8dff-be4cea9429b3',
//       clientToken: 'pub7216f8a2d1091e263c95c1205882474e',
//       site: 'datad0g.com',
//       service: 'benoit-test-1',
//       env: 'dev',
//       sessionSampleRate: 100,
//       sessionReplaySampleRate: 100,
//       defaultPrivacyLevel: 'mask-user-input',
//   });
//
//   datadogRum.setUser({
//       id: '1234',
//       name: 'Beltran',
//       email: 'beltran@mail.com'
//   });
//
//   console.log('RUM initialized successfully');
// } catch (error) {
//   console.error('Error initializing RUM:', error);
// }

// Function to inject the iframe
function injectIframe() {
  try {
    const container = document.createElement('div');
    container.id = 'extension-ui-container';
    container.style.position = 'fixed';
    container.style.bottom = '20px';
    container.style.right = '20px';
    container.style.width = '300px';
    container.style.height = '250px';
    container.style.zIndex = '9999';
    container.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    container.style.borderRadius = '5px';
    container.style.overflow = 'hidden';

    const iframe = document.createElement('iframe');
    
    const iframeUrl = chrome.runtime.getURL('src/iframe.html');
    console.log('Loading iframe from:', iframeUrl);
    
    iframe.src = iframeUrl;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '5px';

    container.appendChild(iframe);
    
    if (document.body) {
      document.body.appendChild(container);
      console.log('Iframe injected successfully');
    } else {
      console.log('Document body not available, waiting for DOMContentLoaded');
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          document.body.appendChild(container);
          console.log('Iframe injected after DOMContentLoaded');
        } else {
          console.error('Document body still not available after DOMContentLoaded');
        }
      });
    }
  } catch (error) {
    console.error('Error injecting iframe:', error);
    console.error('Error stack:', error.stack);
  }
}

console.log('[Testing] Running test code. ------------------------------------');

const isolatedErrorStack = new Error().stack || "";
console.log(">>> [Main] Error stack:", isolatedErrorStack);

const hasExtensionURLIsolated = isolatedErrorStack.includes("chrome-extension://");
console.log("hasExtensionURL:", hasExtensionURLIsolated);

console.log("Current URL:", window.location.href);
console.log("Document title:", document.title);
console.log("Extension ID (if available):", chrome.runtime.id || "Unknown");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content Script] Received message:', message);
  
  if (message.action === 'login') {
    console.log('[Content Script] User logged in:', message.username);
    sendResponse({ success: true });
  }
  
  return true;
});

setTimeout(injectIframe, 1000);

datadogRum.startSessionReplayRecording();
