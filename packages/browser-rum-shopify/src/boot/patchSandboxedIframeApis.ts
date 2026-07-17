import { globalObject } from '@datadog/browser-core'

/**
 * A Shopify Custom Pixel runs in a "lax" sandboxed iframe (`sandbox="allow-scripts"`, no
 * `allow-same-origin`): it shares the parent page's cookie jar (same domain) but has an
 * opaque/`null` origin for its own window/document. Several browser APIs the RUM SDK relies on
 * either don't work there or throw synchronously in ways the SDK doesn't fully guard against,
 * which silently breaks session tracking and view/URL resolution:
 * - `cookieStore.getAll()` is blocked; `document.cookie` works fine as a fallback.
 * - `navigator.locks.request()` throws a synchronous `SecurityError` (the Web Locks API is
 * denied without Permissions Policy delegation), but the SDK only catches an async rejection.
 * - `getPristineWindow()` creates a nested iframe to read an unpatched `URL` constructor; that
 * nested iframe's `contentWindow` is cross-origin here, and reading a property off it throws.
 * Shimming these away makes the SDK fall back to code paths that do work in this context
 * (`document.cookie`, same-document promise chaining, `globalObject.URL`).
 */
export function patchSandboxedIframeApis() {
  disableProperty(globalObject, 'cookieStore')
  disableProperty(navigator, 'locks')

  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    get() {
      return null
    },
    configurable: true,
  })
}

function disableProperty(target: object, key: string) {
  Object.defineProperty(target, key, {
    value: undefined,
    configurable: true,
    writable: true,
  })
}
