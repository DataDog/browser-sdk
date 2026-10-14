import { mockable } from '@datadog/js-core/util'
import { display } from '@datadog/browser-core'
import type { WebPixelApi, WebPixelRumInitConfiguration } from '../domain/webPixelUtils'
import { createShopifySessionStoreFactory } from '../domain/shopifySessionStore'
import { startWebPixelRum } from './startWebPixelRum'

export function startRegisteredWebPixel(api: WebPixelApi & { settings: Record<string, unknown> }) {
  let configuration: WebPixelRumInitConfiguration
  try {
    if (typeof api.settings.rumConfig !== 'string') {
      throw new Error('Missing rumConfig')
    }
    configuration = JSON.parse(api.settings.rumConfig)
  } catch {
    display.error('Shopify settings.rumConfig must contain valid JSON')
    return
  }

  mockable(startWebPixelRum)(configuration, api, createShopifySessionStoreFactory(api.browser))
}
