import { clocksNow, elapsed, toServerDuration } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import { validateAndBuildConfiguration } from '@datadog/js-core/configuration'
import { createEndpointBuilder } from '@datadog/js-core/transport'
import { monitorError } from '@datadog/js-core/monitor'
import type { Context } from '@datadog/js-core/util'
import { combine, mockable } from '@datadog/js-core/util'
import {
  BROWSER_CORE_SCHEMA,
  buildTags,
  createBatch,
  createTrackingConsentState,
  display,
  ErrorHandling,
  ErrorSource,
  generateUUID,
  setInterval,
  startSessionManager,
  throttle,
  TrackingConsent,
} from '@datadog/browser-core'
import type { InitConfiguration, SessionManager } from '@datadog/browser-core'
import type { RawRumActionEvent, RawRumEvent } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from '../domain/shopifyAnalytics'
import { getPageUrl } from '../domain/shopifyAnalytics'
import type { ElementData, ErrorData } from '../domain/shopifyBindings'
import { isCheckoutPage } from '../domain/shopifyBindings'
import type { ShopifyBrowserApi } from '../domain/shopifyCookieAccess'
import { createShopifyCookieAccessFactory } from '../domain/shopifyCookieAccess'

/**
 * RUM for a Shopify Web Pixel app extension: a strict sandbox Web Worker, with no DOM. Instead of
 * running the full RUM SDK, it turns Shopify checkout events into RUM views, actions and errors,
 * attached to the session shared with the storefront through the top frame cookies.
 */

const WEB_PIXEL_SCHEMA = {
  ...BROWSER_CORE_SCHEMA,
  applicationId: { type: 'string', required: true },
  bypassCustomerPrivacy: { type: 'boolean', default: false },
} as const

export type WebPixelRumInitConfiguration = InitConfiguration & {
  applicationId: string
  /**
   * Collect data regardless of the visitor's consent. Only effective if the pixel extension
   * declares no privacy purposes: otherwise Shopify doesn't run it without consent.
   */
  bypassCustomerPrivacy?: boolean
}

/**
 * See https://shopify.dev/docs/api/web-pixels-api/pixel-privacy
 */
export interface ShopifyCustomerPrivacyStatus {
  analyticsProcessingAllowed: boolean
}

export interface WebPixelApi {
  analytics: ShopifyAnalyticsApi
  browser: ShopifyBrowserApi
  init: { customerPrivacy: ShopifyCustomerPrivacyStatus }
  customerPrivacy: {
    subscribe: (
      eventName: 'visitorConsentCollected',
      callback: (event: { customerPrivacy: ShopifyCustomerPrivacyStatus }) => void
    ) => void
  }
}

// Shopify standard checkout events, collected as custom actions
// https://shopify.dev/docs/api/web-pixels-api/standard-events
export const CHECKOUT_EVENTS = [
  'checkout_started',
  'checkout_contact_info_submitted',
  'checkout_address_info_submitted',
  'checkout_shipping_info_submitted',
  'payment_info_submitted',
  'checkout_completed',
]

// Same values as the RUM SDK view collection
const THROTTLE_VIEW_UPDATE_PERIOD = 3000
const SESSION_KEEP_ALIVE_INTERVAL = 5 * 60 * 1000

interface ActiveView {
  id: string
  url: string
  referrer: string
  loadingType: 'initial_load' | 'route_change'
  startClocks: ClocksState
  endClocks?: ClocksState
  documentVersion: number
  actionCount: number
  errorCount: number
}

interface Collection {
  expandOrRenewSession: () => void
  startView: (url: string, startClocks: ClocksState) => void
  addAction: (type: 'custom' | 'click', name: string, context: Context | undefined, startClocks: ClocksState) => void
  addError: (message: string, stack: string | undefined, context: Context | undefined, startClocks: ClocksState) => void
}

// Events before assembly, as produced by the RUM SDK collections. The view `_dd` only carries what
// applies here: there is no Session Replay in the worker.
type RawEvent =
  | RawRumActionEvent
  | Extract<RawRumEvent, { type: 'error' }>
  | (Omit<Extract<RawRumEvent, { type: 'view' }>, '_dd'> & {
      _dd: { document_version: number; configuration: { session_sample_rate: number } }
    })

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
    configuration.bypassCustomerPrivacy || init.customerPrivacy.analyticsProcessingAllowed
      ? TrackingConsent.GRANTED
      : TrackingConsent.NOT_GRANTED
  )
  if (!configuration.bypassCustomerPrivacy) {
    customerPrivacy.subscribe('visitorConsentCollected', (event) => {
      trackingConsentState.update(
        event.customerPrivacy.analyticsProcessingAllowed ? TrackingConsent.GRANTED : TrackingConsent.NOT_GRANTED
      )
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

    function assemble(rawEvent: RawEvent, startClocks: ClocksState) {
      const session = sessionManager.findTrackedSession(startClocks.relative)
      if (!session || !view) {
        return
      }
      return combine(
        {
          _dd: { format_version: 2 as const, sdk_name: 'rum-shopify-web-pixel' },
          application: { id: configuration!.applicationId },
          source: 'browser' as const,
          service: configuration!.service,
          version: configuration!.version,
          session: { id: session.id, type: 'user' as const },
          view: { id: view.id, url: view.url, referrer: view.referrer },
          usr: session.anonymousId ? { anonymous_id: session.anonymousId } : undefined,
          ddtags,
        },
        rawEvent
      ) as unknown as Context
    }

    function sendViewUpdate() {
      if (!view) {
        return
      }
      view.documentVersion += 1
      const timeSpent = elapsed(view.startClocks.relative, (view.endClocks ?? clocksNow()).relative)
      const event = assemble(
        {
          type: 'view',
          date: view.startClocks.timeStamp,
          _dd: {
            document_version: view.documentVersion,
            configuration: { session_sample_rate: configuration!.sessionSampleRate },
          },
          view: {
            action: { count: view.actionCount },
            error: { count: view.errorCount },
            resource: { count: 0 },
            long_task: { count: 0 },
            frustration: { count: 0 },
            is_active: !view.endClocks,
            loading_type: view.loadingType,
            time_spent: toServerDuration(timeSpent),
          },
        },
        view.startClocks
      )
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
      view = {
        id: generateUUID(),
        url,
        referrer: previousView?.url ?? '',
        loadingType: previousView ? 'route_change' : 'initial_load',
        startClocks,
        documentVersion: 0,
        actionCount: 0,
        errorCount: 0,
      }
      sendViewUpdate()
    }

    return {
      expandOrRenewSession: () => sessionManager.expandOrRenew(),

      startView,

      addAction(type, name, context, startClocks) {
        const event = assemble(
          {
            type: 'action',
            date: startClocks.timeStamp,
            action: { id: generateUUID(), type, target: { name } },
            context,
          },
          startClocks
        )
        if (event) {
          view!.actionCount += 1
          batch.add(event)
          scheduleViewUpdate()
        }
      },

      addError(message, stack, context, startClocks) {
        const event = assemble(
          {
            type: 'error',
            date: startClocks.timeStamp,
            error: {
              id: generateUUID(),
              message,
              stack,
              source: ErrorSource.CUSTOM,
              handling: ErrorHandling.HANDLED,
              source_type: 'browser',
            },
            context,
          },
          startClocks
        )
        if (event) {
          view!.errorCount += 1
          batch.add(event)
          scheduleViewUpdate()
        }
      },
    }
  }
}

interface ShopifyCheckout {
  token?: string
  currencyCode?: string
  totalPrice?: { amount?: number }
  order?: { id?: string }
}

// Only non-personal checkout fields: Shopify events also carry the buyer's contact and address
function getCheckoutContext(checkout: ShopifyCheckout | undefined): Context | undefined {
  if (!checkout) {
    return
  }
  return {
    checkout: {
      token: checkout.token,
      currency: checkout.currencyCode,
      total_price: checkout.totalPrice?.amount,
      order_id: checkout.order?.id,
    },
  }
}
