// PoC (bonus phase of the internal API plan, see /plan.md): the Shopify SDK no longer wraps the
// full RUM public API — the Shopify Web Pixel bindings drive the RUM internal API directly.
// Views are started as internal API events (like the react router plugin), clicks are one-shot
// action events, and checkout UI extension errors are formatted with `formatErrorEvent`.
//
// Differences vs the replaced implementation (which went through the public API):
// * `startView({ url })` → `internalApi.startEvent({ type: 'view', view: { url } })`: the view
//   event is bare (no loading type, no name, no view metrics machinery — trackViews is not
//   started). The initial version is emitted right away via handle.update(), mirroring the
//   react router plugin.
// * `startAction()` + `stopAction()` back-to-back → a one-shot `addEvent` action (same zero
//   duration result).
// * `addError()` → `formatErrorEvent` (the free formatter) + `addEvent`.

import { clocksNow } from '@datadog/js-core/time'
import { ErrorSource, NonErrorPrefix } from '@datadog/browser-core'
import type { Context } from '@datadog/browser-core'
import { ActionType, formatErrorEvent } from '@datadog/browser-rum-core'
import type { RumInternalApi, ViewEventHandle } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'

export interface ElementData {
  id?: string
}

export interface ErrorData {
  message?: string
  trace?: string
  extensionName?: string
  extensionTarget?: string
  type?: string
  appId?: string
  appName?: string
  appVersion?: string
}

// Matches /checkouts/*, /checkout, including locale-prefixed paths.
// Storefront pages never match: they get their RUM data from the Theme Liquid snippet (a separate
// SDK instance), and tracking them from the pixel sandbox iframe would double-track the same
// page view.
const CHECKOUT_PATH = /\/(([a-z]{2}(-[a-z0-9]+)?)\/)?(checkouts?)(\/|$)/i

/**
 * Wires Shopify Web Pixel standard events to the RUM internal API. `analytics` is the sandbox's
 * `analytics` global (or `undefined` outside the sandbox, in which case bindings are skipped).
 */
export function initShopifyBindings(internalApi: RumInternalApi, analytics: ShopifyAnalyticsApi | undefined) {
  if (!analytics) {
    return
  }

  let currentViewHandle: ViewEventHandle | undefined

  analytics.subscribe('page_viewed', (event) => {
    const url = event.context?.document?.location?.href

    if (!url || !CHECKOUT_PATH.test(url)) {
      return
    }

    const startClocks = clocksNow()
    // Throw-on-double-view: stop the previous view at the new one's start time (router
    // semantics, like the react router plugin).
    currentViewHandle?.stop(undefined, { endClocks: startClocks })
    currentViewHandle = internalApi.startEvent({ type: 'view', view: { url } }, { startClocks })
    // Emit the initial view version right away: views are sent incrementally by the internal
    // API (see /plan.md, phase 3a finding).
    currentViewHandle.update({})
  })

  analytics.subscribe('clicked', (event: ShopifyPixelEvent<{ element?: ElementData }>) => {
    const element = event.data?.element
    const name = element?.id ?? 'element-without-id'
    internalApi.addEvent({
      baseRumEvent: {
        type: 'action',
        action: { type: ActionType.CLICK, target: { name } },
      },
    })
  })

  // Fires when a Shopify checkout UI extension crashes.
  analytics.subscribe('ui_extension_errored', (event: ShopifyPixelEvent<{ error?: ErrorData }>) => {
    const error = event.data?.error
    const startClocks = clocksNow()
    const err = new Error(error?.message)
    err.stack = error?.trace
    const { baseRumEvent } = formatErrorEvent({
      originalError: err,
      nonErrorPrefix: NonErrorPrefix.PROVIDED,
      source: ErrorSource.CUSTOM,
      startClocks,
    })
    internalApi.addEvent({
      baseRumEvent: {
        ...baseRumEvent,
        context: {
          extensionName: error?.extensionName,
          extensionTarget: error?.extensionTarget,
          extensionErrorType: error?.type,
          appId: error?.appId,
          appName: error?.appName,
          appVersion: error?.appVersion,
        } as Context,
      },
      baggage: { startClocks, originalError: err, domainContext: { error: err } },
    })
  })
}
