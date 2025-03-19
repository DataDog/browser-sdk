import { datadogRum } from '@datadog/browser-rum'

console.log('[iFrame] Script loaded');

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

const errorStack = new Error().stack || "";
console.log(">>> [iFrame] Error stack:", errorStack);
console.log("Does the error stack include chrome-extension://?", errorStack.includes("chrome-extension://"));
console.log("Current URL:", window.location.href);
console.log("Document title:", document.title);

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      console.log('[iFrame] Login attempt:', { username });
      
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'login',
          username: username
        }, (response) => {
          console.log('[iFrame] Login response:', response);
        });
      }
      
      console.log('[iFrame] Login successful');
    });
  } else {
    console.error('[iFrame] Login form not found');
  }
});