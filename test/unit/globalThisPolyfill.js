// Polyfill globalThis for browsers that don't support it (e.g. Chrome < 71)
// Required because @angular/core uses globalThis internally.
/* eslint-disable no-undef */
if (typeof globalThis === 'undefined') {
  window.globalThis = window
}
