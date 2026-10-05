import { clocksNow } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { validateAndBuildConfiguration } from '@datadog/js-core/configuration'
import { createEndpointBuilder } from '@datadog/js-core/transport'
import { monitorError } from '@datadog/js-core/monitor'
import type { Context } from '@datadog/js-core/util'
import { combine, mockable } from '@datadog/js-core/util'
import {
  buildTags,
  createBatch,
  createTrackingConsentState,
  display,
  setInterval,
  startSessionManager,
  throttle,
  TrackingConsent,
} from '@datadog/browser-core'
import type { SessionManager } from '@datadog/browser-core'
import type { DefaultRumEventAttributes } from '@datadog/browser-rum-core'
import { getPageUrl } from '../domain/shopifyAnalytics'
import type { ShopifyPixelEvent } from '../domain/shopifyAnalytics'
import type { ElementData, ErrorData } from '../domain/shopifyBindings'
import { isCheckoutPage } from '../domain/shopifyBindings'
import { createShopifyCookieAccessFactory } from '../domain/shopifyCookieAccess'
import type { ActiveView, ShopifyCheckout, WebPixelApi, WebPixelRumInitConfiguration } from '../domain/webPixelUtils'
import {
  buildActionEvent,
  buildCommonAttributes,
  buildErrorEvent,
  buildViewEvent,
  CHECKOUT_EVENTS,
  createView,
  getCheckoutContext,
  toTrackingConsent,
  WEB_PIXEL_SCHEMA,
} from '../domain/webPixelUtils'

/**
 * RUM for a Shopify Web Pixel app extension: a strict sandbox Web Worker, with no DOM. Instead of
 * running the full RUM SDK, it turns Shopify checkout events into RUM views, actions and errors,
 * attached to the session shared with the storefront through the top frame cookies.
 */

// Same values as the RUM SDK view collection
const THROTTLE_VIEW_UPDATE_PERIOD = 3000
const SESSION_KEEP_ALIVE_INTERVAL = 5 * 60 * 1000

interface Collection {
  expandOrRenewSession: () => void
  startView: (url: string, startClocks: ClocksState) => void
  addAction: (type: 'custom' | 'click', name: string, context: Context | undefined, startClocks: ClocksState) => void
  addError: (message: string, stack: string | undefined, context: Context | undefined, startClocks: ClocksState) => void
}

export function startWebPixelRum(
  initConfiguration: WebPixelRumInitConfiguration,
  { analytics, browser, init, customerPrivacy }: WebPixelApi
) {
  const configuration = validateAndBuildConfiguration(
    {
      ...initConfiguration,
      sessionPersistence: 'cookie',
      sessionCookieAccess: createShopifyCookieAccessFactory(browser),
    },
    WEB_PIXEL_SCHEMA,
    display
  )
  if (!configuration) {
    return
  }

  const trackingConsentState = createTrackingConsentState(
    configuration.bypassCustomerPrivacy ? TrackingConsent.GRANTED : toTrackingConsent(init.customerPrivacy)
  )
  if (!configuration.bypassCustomerPrivacy) {
    customerPrivacy.subscribe('visitorConsentCollected', (event) => {
      trackingConsentState.update(toTrackingConsent(event.customerPrivacy))
    })
  }

  let collection: Promise<Collection | undefined> | undefined

  // Shopify also runs the pixel on storefront pages, where the storefront SDK owns the session
  // cookie: writing it from both contexts at once could create two sessions. So the session only
  // starts on the first checkout page view, where the storefront SDK doesn't run, once the visitor
  // consents. The session manager then expires and renews the session as consent changes.
  function startCollectionOnce() {
    collection ??= new Promise<void>((resolve) => trackingConsentState.onGrantedOnce(resolve))
      .then(() => mockable(startSessionManager)(configuration!, trackingConsentState))
      .then((sessionManager) => sessionManager && startCollection(sessionManager))
  }

  // Shopify events can arrive before consent or before the session is resolved: queue them,
  // keeping their time, like the RUM SDK does before consent.
  // Every Shopify event is buyer activity, which keeps the session alive.
  function whenReady(callback: (collection: Collection, startClocks: ClocksState) => void) {
    const startClocks = clocksNow()
    collection
      ?.then((current) => {
        if (current) {
          current.expandOrRenewSession()
          callback(current, startClocks)
        }
      })
      .catch(monitorError)
  }

  analytics.subscribe('page_viewed', (event) => {
    if (isCheckoutPage(event)) {
      startCollectionOnce()
      whenReady((current, startClocks) => current.startView(getPageUrl(event)!, startClocks))
    }
  })

  analytics.subscribe('clicked', (event: ShopifyPixelEvent<{ element?: ElementData }>) => {
    if (isCheckoutPage(event)) {
      const name = event.data?.element?.id ?? 'element-without-id'
      whenReady((current, startClocks) => current.addAction('click', name, undefined, startClocks))
    }
  })

  for (const eventName of CHECKOUT_EVENTS) {
    analytics.subscribe(eventName, (event: ShopifyPixelEvent<{ checkout?: ShopifyCheckout }>) => {
      whenReady((current, startClocks) =>
        current.addAction('custom', eventName, getCheckoutContext(event.data?.checkout), startClocks)
      )
    })
  }

  analytics.subscribe('ui_extension_errored', (event: ShopifyPixelEvent<{ error?: ErrorData }>) => {
    if (isCheckoutPage(event)) {
      const { message, trace, ...extension } = event.data?.error ?? {}
      whenReady((current, startClocks) =>
        current.addError(message ?? 'Checkout UI extension error', trace, { extension }, startClocks)
      )
    }
  })

  return {
    addAction: (name: string, context?: Context) =>
      whenReady((current, startClocks) => current.addAction('custom', name, context, startClocks)),
    addError: (message: string, context?: Context) =>
      whenReady((current, startClocks) => current.addError(message, undefined, context, startClocks)),
  }

  function startCollection(sessionManager: SessionManager): Collection {
    const batch = mockable(createBatch)({
      endpoints: [createEndpointBuilder(configuration!, 'rum')],
      reportError: (message: string) => display.error(message),
    })

    const ddtags = buildTags(configuration!).join(',')
    let view: ActiveView | undefined
    const { throttled: scheduleViewUpdate } = throttle(() => sendViewUpdate(), THROTTLE_VIEW_UPDATE_PERIOD, {
      leading: false,
    })
    setInterval(() => {
      if (view && !view.endClocks) {
        sendViewUpdate()
      }
    }, SESSION_KEEP_ALIVE_INTERVAL)

    // Like the RUM SDK: a view belongs to one session, so it ends with it, and a new view starts
    // on the same page when the session is renewed
    sessionManager.expireObservable.subscribe(() => {
      endView(clocksNow())
      batch.forceFlush('session_expire')
    })
    sessionManager.renewObservable.subscribe(() => {
      if (view) {
        startView(view.url, clocksNow())
      }
    })

    function assemble(rawEvent: DefaultRumEventAttributes, startClocks: ClocksState) {
      const session = sessionManager.findTrackedSession(startClocks.relative)
      if (!session || !view) {
        return
      }
      return combine(buildCommonAttributes(configuration!, session, view, ddtags), rawEvent) as unknown as Context
    }

    function sendViewUpdate() {
      if (!view) {
        return
      }
      view.documentVersion += 1
      const event = assemble(buildViewEvent(view, clocksNow(), configuration!.sessionSampleRate), view.startClocks)
      if (event) {
        // The latest version of a view replaces the previous ones still waiting in the batch
        batch.upsert(event, view.id)
      }
    }

    function endView(endClocks: ClocksState) {
      if (view && !view.endClocks) {
        view.endClocks = endClocks
        sendViewUpdate()
      }
    }

    function startView(url: string, startClocks: ClocksState) {
      const previousView = view
      endView(startClocks)
      view = createView(url, startClocks, previousView)
      sendViewUpdate()
    }

    return {
      expandOrRenewSession: () => sessionManager.expandOrRenew(),

      startView,

      addAction(type, name, context, startClocks) {
        const event = assemble(buildActionEvent(type, name, context, startClocks), startClocks)
        if (event) {
          view!.actionCount += 1
          batch.add(event)
          scheduleViewUpdate()
        }
      },

      addError(message, stack, context, startClocks) {
        const event = assemble(buildErrorEvent(message, stack, context, startClocks), startClocks)
        if (event) {
          view!.errorCount += 1
          batch.add(event)
          scheduleViewUpdate()
        }
      },
    }
  }
}
