// PoC (bonus phase of the internal API plan, see /plan.md): the Shopify SDK bundle is a minimal
// SDK built on the RUM internal API — the full RUM SDK (auto-instrumentation, recorder,
// profiler) is not part of the bundle anymore. The DD_RUM global it defines only exposes
// init(), taking the Custom Pixel sandbox's `analytics` global.
import { globalObject } from '@datadog/js-core/util'
import { defineGlobal } from '@datadog/browser-core'
import { makeShopifyRumApi } from '../boot/makeShopifyRumApi'
import type { ShopifyRumApi } from '../boot/makeShopifyRumApi'

interface BrowserWindow {
  DD_RUM?: ShopifyRumApi
}

const global = globalObject as BrowserWindow

defineGlobal(global, 'DD_RUM', makeShopifyRumApi())
