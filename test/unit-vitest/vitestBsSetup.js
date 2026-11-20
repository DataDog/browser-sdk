// Vitest only needs WeakRef while loading (see `vitestBrowserPolyfills.js`). Remove the polyfill so the
// SDK sees the same environment as in the real browser: `'WeakRef' in window` is false on old browsers.
if (globalThis.__polyfilledWeakRef__ && globalThis.WeakRef === globalThis.__polyfilledWeakRef__) {
  delete globalThis.WeakRef
}
delete globalThis.__polyfilledWeakRef__
