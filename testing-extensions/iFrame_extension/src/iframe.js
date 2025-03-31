import { init_rum_extensions } from '../../init_rum_extensions'

console.log('[iFrame] Script loaded');

init_rum_extensions()

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