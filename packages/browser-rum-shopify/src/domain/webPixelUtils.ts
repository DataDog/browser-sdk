import { elapsed, toServerDuration } from '@datadog/js-core/time'
import type { ClocksState } from '@datadog/js-core/time'
import type { InferredConfig } from '@datadog/js-core/configuration'
import type { Context } from '@datadog/js-core/util'
import { BROWSER_CORE_SCHEMA, generateUUID, TrackingConsent } from '@datadog/browser-core'
import type { InitConfiguration } from '@datadog/browser-core'
import type { DefaultRumEventAttributes, ViewLoadingType } from '@datadog/browser-rum-core'
import type { ShopifyAnalyticsApi } from './shopifyAnalytics'
import type { ShopifyBrowserApi } from './shopifyCookieAccess'

export const WEB_PIXEL_SCHEMA = {
  ...BROWSER_CORE_SCHEMA,
  applicationId: { type: 'string', required: true },
  bypassCustomerPrivacy: { type: 'boolean', default: false },
} as const

export type WebPixelConfiguration = InferredConfig<typeof WEB_PIXEL_SCHEMA>

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

export function toTrackingConsent({ analyticsProcessingAllowed }: ShopifyCustomerPrivacyStatus) {
  return analyticsProcessingAllowed ? TrackingConsent.GRANTED : TrackingConsent.NOT_GRANTED
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

export interface ShopifyCheckout {
  token?: string
  currencyCode?: string
  totalPrice?: { amount?: number }
  order?: { id?: string }
}

// Only non-personal checkout fields: Shopify events also carry the buyer's contact and address
export function getCheckoutContext(checkout: ShopifyCheckout | undefined): Context | undefined {
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

export interface ActiveView {
  id: string
  url: string
  referrer: string
  loadingType: ViewLoadingType
  startClocks: ClocksState
  endClocks?: ClocksState
  documentVersion: number
  actionCount: number
  errorCount: number
}

export function createView(url: string, startClocks: ClocksState, previousView: ActiveView | undefined): ActiveView {
  return {
    id: generateUUID(),
    url,
    referrer: previousView?.url ?? '',
    loadingType: previousView ? 'route_change' : 'initial_load',
    startClocks,
    documentVersion: 0,
    actionCount: 0,
    errorCount: 0,
  }
}

// Attributes shared by every event, like the RUM SDK assembly contexts add them
export function buildCommonAttributes(
  configuration: WebPixelConfiguration,
  session: { id: string; anonymousId?: string },
  view: ActiveView,
  ddtags: string
) {
  return {
    _dd: { format_version: 2 as const, sdk_name: 'rum-shopify-web-pixel' },
    application: { id: configuration.applicationId },
    source: 'browser' as const,
    service: configuration.service,
    version: configuration.version,
    session: { id: session.id, type: 'user' as const },
    view: { id: view.id, url: view.url, referrer: view.referrer },
    usr: session.anonymousId && configuration.trackAnonymousUser ? { anonymous_id: session.anonymousId } : undefined,
    ddtags,
  }
}

export function buildViewEvent(
  view: ActiveView,
  now: ClocksState,
  sessionSampleRate: number
): DefaultRumEventAttributes {
  return {
    type: 'view',
    date: view.startClocks.timeStamp,
    _dd: {
      document_version: view.documentVersion,
      configuration: { session_sample_rate: sessionSampleRate },
    },
    view: {
      action: { count: view.actionCount },
      error: { count: view.errorCount },
      resource: { count: 0 },
      long_task: { count: 0 },
      frustration: { count: 0 },
      is_active: !view.endClocks,
      loading_type: view.loadingType,
      time_spent: toServerDuration(elapsed(view.startClocks.relative, (view.endClocks ?? now).relative)),
    },
  }
}

export function buildActionEvent(
  type: 'custom' | 'click',
  name: string,
  context: Context | undefined,
  startClocks: ClocksState
): DefaultRumEventAttributes {
  return {
    type: 'action',
    date: startClocks.timeStamp,
    action: { id: generateUUID(), type, target: { name } },
    context,
  }
}

export function buildErrorEvent(
  message: string,
  stack: string | undefined,
  context: Context | undefined,
  startClocks: ClocksState
): DefaultRumEventAttributes {
  return {
    type: 'error',
    date: startClocks.timeStamp,
    error: {
      id: generateUUID(),
      message,
      stack,
      source: 'custom',
      handling: 'handled',
      source_type: 'browser',
    },
    context,
  }
}
