import type { ExtensionApi } from '@shopify/web-pixels-extension'
import { SKIPPED } from '@datadog/js-core/assembly'
import type { RelativeTime } from '@datadog/js-core/time'
import type { RumPlugin, RumPluginOnInitOptions, RumPublicApi } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi, ShopifyPixelEvent } from './shopifyAnalytics'
import { waitForPageViewedEvent } from './shopifyAnalytics'
import { initShopifyBindings, isCheckoutPage } from './shopifyBindings'

// Checkout funnel events, collected as custom actions named after the event.
// https://shopify.dev/docs/api/web-pixels-api/standard-events
export const CHECKOUT_EVENTS = [
  'checkout_started',
  'checkout_contact_info_submitted',
  'checkout_address_info_submitted',
  'checkout_shipping_info_submitted',
  'payment_info_submitted',
  'checkout_completed',
]

// Input DOM events, collected as custom actions named after the event.
// https://shopify.dev/docs/api/web-pixels-api/dom-events
export const INPUT_EVENTS = ['input_focused', 'input_blurred', 'input_changed']

// Always collected: views start from `page_viewed`, and extension crashes are errors.
const ALWAYS_TRACKED_EVENTS = ['page_viewed', 'ui_extension_errored']

// Collected when the `trackedEvents` pixel setting is not set. DOM events other than `clicked` are
// opt-in, as they fire often.
export const DEFAULT_TRACKED_EVENTS = ['clicked', 'alert_displayed'].concat(CHECKOUT_EVENTS)

interface CheckoutData {
  token?: string | null
  currencyCode?: string | null
  totalPrice?: { amount?: number } | null
  order?: { id?: string | null } | null
}

interface AlertData {
  type?: string
  target?: string
  message?: string
}

interface InputElementData {
  id?: string | null
  name?: string | null
  type?: string | null
  tagName?: string | null
}

interface FormElementData {
  id?: string | null
  action?: string | null
}

export function shopifyAppPixelPlugin({ analytics, init, settings }: ExtensionApi): RumPlugin {
  return {
    name: 'shopify-app-pixel',
    async onInit({ initConfiguration, publicApi, registerAssembleEventHook }) {
      // Shopify also runs the pixel on storefront pages, where the storefront SDK already collects.
      const pageViewedEvent = await waitForPageViewedEvent(analytics)
      if (!isCheckoutPage(pageViewedEvent)) {
        return false
      }

      trackViewport(analytics, init.context.window, registerAssembleEventHook)
      trackInitialReferrer(init.context.document.referrer, registerAssembleEventHook)

      const trackedAnalytics = filterTrackedEvents(analytics, settings.trackedEvents)
      initShopifyBindings(publicApi, trackedAnalytics)
      initCheckoutBindings(publicApi, trackedAnalytics)

      initConfiguration.trackViewsManually = true // Views are started from Shopify `page_viewed` events
      // shortcut: memory sessions do not continue storefront sessions; replace with Shopify cookie storage next.
      initConfiguration.sessionPersistence = 'memory'
      initConfiguration.trackUserInteractions = false // Clicks come from Shopify `clicked` events
      initConfiguration.trackResources = false // The worker only sees its own requests
      initConfiguration.trackLongTasks = false // The worker does not run on the checkout main thread
      initConfiguration.sessionReplaySampleRate = 0
      initConfiguration.profilingSampleRate = 0
    },
  }
}

/**
 * Adds the checkout viewport to every event, from the top frame snapshot Shopify sends with each
 * event. Replaces the RUM display context, which can't read the viewport from the worker.
 */
function trackViewport(
  analytics: ShopifyAnalyticsApi,
  initialWindow: { innerWidth?: number; innerHeight?: number },
  registerAssembleEventHook: RumPluginOnInitOptions['registerAssembleEventHook']
) {
  let viewport = toViewport(initialWindow)
  analytics.subscribe('all_events', (event) => {
    viewport = toViewport(event.context?.window) ?? viewport
  })
  registerAssembleEventHook(({ eventType }) => ({ type: eventType, display: viewport ? { viewport } : undefined }))
}

/**
 * Adds the checkout page referrer to the events of the first view. The RUM URL contexts read it
 * from `document.referrer`, which the worker doesn't have. Later views keep the previous view URL as
 * referrer.
 */
function trackInitialReferrer(
  referrer: string,
  registerAssembleEventHook: RumPluginOnInitOptions['registerAssembleEventHook']
) {
  // View events are identified by their start time: the first view event marks the first view,
  // a view event starting later marks the second one.
  let firstViewStart: RelativeTime | undefined
  let secondViewStart: RelativeTime | undefined
  registerAssembleEventHook(({ eventType, startTime }) => {
    if (eventType === 'view' && secondViewStart === undefined) {
      if (firstViewStart === undefined) {
        firstViewStart = startTime
      } else if (startTime > firstViewStart) {
        secondViewStart = startTime
      }
    }
    if (secondViewStart !== undefined && startTime >= secondViewStart) {
      return SKIPPED
    }
    return { type: eventType, view: { referrer } }
  })
}

function toViewport(window: { innerWidth?: number; innerHeight?: number } | undefined) {
  return window?.innerWidth !== undefined && window.innerHeight !== undefined
    ? { width: window.innerWidth, height: window.innerHeight }
    : undefined
}

/**
 * Only subscribes to the events listed in the `trackedEvents` pixel setting (comma-separated), set
 * by the app. A missing or blank setting means the defaults; the app saves `none` for an empty
 * selection.
 */
function filterTrackedEvents(analytics: ShopifyAnalyticsApi, trackedEventsSetting: unknown): ShopifyAnalyticsApi {
  const trackedEvents = new Set(
    ALWAYS_TRACKED_EVENTS.concat(
      typeof trackedEventsSetting === 'string' && trackedEventsSetting.trim()
        ? trackedEventsSetting.split(',').map((eventName) => eventName.trim())
        : DEFAULT_TRACKED_EVENTS
    )
  )
  return {
    subscribe: (eventName, callback) => {
      if (trackedEvents.has(eventName)) {
        analytics.subscribe(eventName, callback)
      }
    },
  }
}

function initCheckoutBindings(rumPublicApi: RumPublicApi, analytics: ShopifyAnalyticsApi) {
  for (const eventName of CHECKOUT_EVENTS) {
    analytics.subscribe(eventName, (event: ShopifyPixelEvent<{ checkout?: CheckoutData }>) => {
      // Only non-personal fields: the checkout payload also holds email, phone and addresses.
      const checkout = event.data?.checkout
      rumPublicApi.addAction(eventName, {
        checkout: {
          token: checkout?.token,
          currencyCode: checkout?.currencyCode,
          totalPrice: checkout?.totalPrice?.amount,
          orderId: checkout?.order?.id,
        },
      })
    })
  }

  // Fires when the buyer sees an alert, such as a field validation error. `alert.value` (the buyer
  // input) is not forwarded.
  analytics.subscribe('alert_displayed', (event: ShopifyPixelEvent<{ alert?: AlertData }>) => {
    const alert = event.data?.alert
    rumPublicApi.addAction('alert_displayed', {
      alert: { type: alert?.type, target: alert?.target, message: alert?.message },
    })
  })

  // The element `value` (the buyer input) is not forwarded.
  for (const eventName of INPUT_EVENTS) {
    analytics.subscribe(eventName, (event: ShopifyPixelEvent<{ element?: InputElementData }>) => {
      const element = event.data?.element
      rumPublicApi.addAction(eventName, {
        element: { id: element?.id, name: element?.name, type: element?.type, tagName: element?.tagName },
      })
    })
  }

  // The form `elements` (with the buyer input) are not forwarded.
  analytics.subscribe('form_submitted', (event: ShopifyPixelEvent<{ element?: FormElementData }>) => {
    const element = event.data?.element
    rumPublicApi.addAction('form_submitted', { element: { id: element?.id, action: element?.action } })
  })
}
