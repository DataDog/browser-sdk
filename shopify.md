# Datadog Shopify App: RUM

Goal: a Shopify app that sets up RUM on storefront and checkout from one place (App Home), with no manual snippets. Like [PixieHog](https://github.com/celadonworks/pixiehog-app).

## Links

- Confluence: [Shopify App](https://datadoghq.atlassian.net/wiki/spaces/RUMP/pages/7270531913/Shopify+App) · [RFC App Home](https://datadoghq.atlassian.net/wiki/spaces/RUMP/pages/7271514666/RFC+Shopify+App+in+App+Home) (outdated) · [Web Pixel Shopify App](https://datadoghq.atlassian.net/wiki/spaces/RUMP/pages/7329186071/Web+Pixel+Shopify+App) · [Implementation Strategy](https://datadoghq.atlassian.net/wiki/spaces/RUMP/pages/7305724070/Implementation+Strategy) (dropped)
- PRs: [#5140](https://github.com/DataDog/browser-sdk/pull/5140) guard browser globals · [#5130](https://github.com/DataDog/browser-sdk/pull/5130) session store factory · [#5109](https://github.com/DataDog/browser-sdk/pull/5109) custom cookie store · [#5108](https://github.com/DataDog/browser-sdk/pull/5108) separate Web Pixel SDK (dropped approach)
- POC app: [poc-dd-rum-sh](https://github.com/BeltranBulbarellaDD/poc-dd-rum-sh) (local: `../poc-dd-rum`)
- Shopify: [Web Pixels API](https://shopify.dev/docs/api/web-pixels-api) · [standard events](https://shopify.dev/docs/api/web-pixels-api/standard-events) · [DOM events](https://shopify.dev/docs/api/web-pixels-api/dom-events) · [`browser` API](https://shopify.dev/docs/api/web-pixels-api/standard-api/browser) · [`init`](https://shopify.dev/docs/api/web-pixels-api/standard-api/init) · [pixel privacy](https://shopify.dev/docs/api/web-pixels-api/pixel-privacy)

## Architecture

One SDK per page: the storefront embed and the checkout pixel never collect on the same page.

| Surface    | Runs in                                                         | SDK                                                                                                         | Config from                                           |
| ---------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| App Home   | Iframe app (React Router, Druids)                               | none yet                                                                                                    | writes the metafield and pixel settings               |
| Storefront | Theme App Embed (`datadog-rum.liquid`)                          | regular `datadog-rum-shopify.js`, full RUM                                                                  | `app.metafields.datadog.rum_config`                   |
| Checkout   | Web Pixel app extension, strict sandbox **Web Worker** (no DOM) | `datadog-rum-shopify-web-pixel.js` = regular RUM SDK + `shopifyAppPixelPlugin`, loaded with `importScripts` | pixel `settings.rumConfig` + `settings.trackedEvents` |

Pixel SDK (`packages/browser-rum-shopify`):

- `src/entries/webPixel.ts`: calls Shopify `register`, parses `rumConfig`, then `makeRumPublicApi(…, { allowWorker: true })` and `init`.
- `src/domain/shopifyAppPixelPlugin.ts`:
  - Stops unless the first `page_viewed` is a checkout page.
  - Maps Shopify events to RUM.
  - Forces the worker config: manual views; no clicks, resources, long tasks, replay or profiling.

How we make the SDK run in the worker, cheapest first:

1. Plugin config.
2. Plugin `registerAssembleEventHook`, to add Shopify data (URL, referrer, viewport).
3. A minimal core guard, only where the SDK crashes, at module level.

No polyfilling `window` / `document`.

## What we support

**Checkout (pixel).** Merchants pick events as pills in App Home, stored in `settings.trackedEvents`.

| Shopify event                                                                                                                                                                | RUM                                                                | Default   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------- |
| `page_viewed`                                                                                                                                                                | view                                                               | always on |
| `ui_extension_errored`                                                                                                                                                       | error                                                              | always on |
| `clicked`                                                                                                                                                                    | click action named after the element id                            | on        |
| `checkout_started`, `checkout_contact_info_submitted`, `checkout_address_info_submitted`, `checkout_shipping_info_submitted`, `payment_info_submitted`, `checkout_completed` | custom action: token, currency, total, order id (no personal data) | on        |
| `alert_displayed`                                                                                                                                                            | custom action: type, target, message (no `value`)                  | on        |
| `form_submitted`, `input_focused`, `input_blurred`, `input_changed`                                                                                                          | custom action: element id/name/type/tag (no `value`)               | off       |

**Storefront (embed).**

- Full RUM.
- View context `shopify: { pageType, productId, collectionId }` from Liquid. It stands in for `product_viewed`, `collection_viewed` and `cart_viewed`.

**Not supported:**

- Storefront-only pixel events (`product_*`, `cart_viewed`, `collection_viewed`, `search_submitted`): only the pixel receives them, and it doesn't collect on storefront pages, to keep one SDK per page.
- On checkout: Session Replay, Web Vitals, resources, long tasks. The worker can't see the checkout page.

## Testing

Local loop:

1. `yarn dev` serves `http://localhost:8080/datadog-rum-shopify-web-pixel.js` and rebuilds it on change.
2. In `../poc-dd-rum`, run `shopify app dev`. Both extensions load the local bundles.
3. Reload checkout and read the **worker** console. Debug mode is on in the entry; without it, `monitor()` swallows the errors.
   - Chrome asks for Local Network Access before an https page can load from `localhost`. Allow it, or serve the bundle through an https tunnel.

Other checks:

- **Unit tests:** `yarn test:unit --spec packages/browser-rum-shopify/src/domain/shopifyAppPixelPlugin.spec.ts`.
- **Later:** e2e Web Pixel scenario on the `custom-pixel-e2e` store, plus an eslint rule against unguarded `window` / `document`.

## Next steps

1. **Crash walk-through, one API at a time.** Reload checkout, fix the first crash, record the result as yes/no/why. Expected order:
   1. `createDOMMutationObservable`
   2. location change
   3. `window.open`
   4. page state
   5. URL contexts (`document.referrer`)
   6. display
   7. CI visibility (`document.cookie`)
   8. view creation (`window.location`)
   9. view metrics (one gate in `trackViews`)
   10. `runOnReadyState`
   11. `requestIdleCallback`
   12. report observable
2. **Shopify data through plugin hooks:** URL, referrer, viewport and locale from `event.context`.
3. **Shared session with the storefront:** session store factory through `RumPublicApiOptions` (#5130), backed by `browser.cookie`.
4. **Session expiry:** extend the session on each Shopify event (`expandOrRenew`). The plugin can't reach it today.
5. **Consent:** keep Shopify's gating (`customer_privacy.analytics = true`), or let the SDK handle it (RFC "always collect" mode).
6. **Upstream:** move the guards into a cleaner #5140, plus the eslint rule and e2e.

## Open questions

- `sdkName`: `rum-shopify` or `rum-shopify-web-pixel`?
- Deprecate `DD_RUM.shopifyPlugin` (the Custom Pixel), and on what timeline?
- Should the merchant be able to pin the SDK version, or does the app always load the CDN latest?
