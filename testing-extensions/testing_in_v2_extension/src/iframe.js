import { init_rum_extensions } from '../../init_rum_extensions'

console.log('[iFrame] Script loaded');

init_rum_extensions()

// Log error stack information
const errorStack = new Error().stack || "";
console.log(">>> [iFrame] Error stack:", errorStack);
console.log("Does the error stack include chrome-extension://?", errorStack.includes("chrome-extension://"));
console.log("Current URL:", window.location.href);
console.log("Document title:", document.title);

// Handle form submission
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  if (loginForm) {
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      console.log('[iFrame] Login attempt:', { username });
      
      // You could send a message to the background script or parent page here
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'login',
          username: username
        }, (response) => {
          console.log('[iFrame] Login response:', response);
        });
      }
      
      // For testing purposes, just log the credentials
      console.log('[iFrame] Login successful');
    });
  } else {
    console.error('[iFrame] Login form not found');
  }
});