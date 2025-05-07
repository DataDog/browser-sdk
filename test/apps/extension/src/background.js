/* global chrome */
// Minimal background service worker to help with extension ID detection
console.log('Background service worker initialized')

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed')
})