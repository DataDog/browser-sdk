/**
 * Receive an HTML event from the page
 * and forward it as an action message to extension logic
 */

document.documentElement.addEventListener('extension', (event: any) => {
  chrome.runtime.sendMessage({ action: event.detail.action, payload: event.detail.payload })
})
