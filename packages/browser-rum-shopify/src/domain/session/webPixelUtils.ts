/**
 * Subset of the Web Pixel `browser` API. Its methods run asynchronously in the top frame, which
 * is the only place cookies are reachable from a Web Pixel sandbox.
 * See https://shopify.dev/docs/api/web-pixels-api/standard-api/browser
 */
export interface ShopifyBrowserApi {
  cookie: {
    get: (name: string) => Promise<string>
    set: (cookie: string) => Promise<string>
  }
}
