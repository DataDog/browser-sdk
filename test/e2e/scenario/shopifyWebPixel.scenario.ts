import { expect, test } from '@playwright/test'
import { bundleSetup, createTest, DEFAULT_RUM_CONFIGURATION } from '../lib/framework'

const CHECKOUT_PATH = '/checkouts/cn/abc/en-us'
const STOREFRONT_REFERRER = 'https://shop.example/cart'

// Runs the Web Pixel bundle in a dedicated Web Worker, like Shopify's strict sandbox, with a fake
// Web Pixels API. Shopify buffers events and replays them to late subscribers, so the fake does too.
const WORKER_SOURCE = `
  const events = []
  const subscribers = {}

  function subscribe(name, callback) {
    ;(subscribers[name] = subscribers[name] || []).push(callback)
    events.filter((event) => name === 'all_events' || event.name === name).forEach(callback)
  }

  function createContext(path) {
    const location = new URL(path, 'https://shop.example')
    return {
      document: { location: { href: location.href, pathname: location.pathname }, referrer: '${STOREFRONT_REFERRER}' },
      window: { innerWidth: 1280, innerHeight: 800 },
    }
  }

  function emit(name, path, data) {
    const event = { id: String(events.length), name, timestamp: new Date().toISOString(), context: createContext(path), data }
    events.push(event)
    ;(subscribers[name] || []).concat(subscribers.all_events || []).forEach((callback) => callback(event))
  }

  self.onmessage = ({ data }) => {
    if (data.type === 'register') {
      self.shopify = {
        extend: (_extensionPoint, extend) =>
          extend({
            analytics: { subscribe },
            init: { context: createContext('${CHECKOUT_PATH}'), customerPrivacy: {}, data: {} },
            customerPrivacy: { subscribe: () => undefined },
            settings: { rumConfig: JSON.stringify(data.rumConfig) },
          }),
      }
      importScripts(data.bundleUrl)
    } else {
      emit(data.name, data.path, data.data)
    }
  }
`

test.describe('shopify web pixel', () => {
  createTest('collects checkout events from a web worker')
    .withSetup(bundleSetup)
    .run(async ({ page, baseUrl, servers, intakeRegistry, withBrowserLogs }) => {
      await page.evaluate(
        ({ workerSource, rumConfig, bundleUrl, checkoutPath }) => {
          const worker = new Worker(URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' })))
          worker.postMessage({ type: 'register', rumConfig, bundleUrl })
          worker.postMessage({ type: 'event', name: 'page_viewed', path: checkoutPath })
          worker.postMessage({
            type: 'event',
            name: 'checkout_started',
            path: checkoutPath,
            data: { checkout: { token: 'checkout-token', currencyCode: 'USD', email: 'buyer@example.com' } },
          })
          worker.postMessage({ type: 'event', name: 'clicked', path: checkoutPath, data: { element: { id: 'pay' } } })
        },
        {
          workerSource: WORKER_SOURCE,
          rumConfig: { ...DEFAULT_RUM_CONFIGURATION, proxy: servers.datadogHttpApi.origin },
          bundleUrl: new URL('/datadog-rum-shopify-web-pixel.js', baseUrl).href,
          checkoutPath: CHECKOUT_PATH,
        }
      )

      // In workers, the SDK sends each event as soon as it is collected
      await expect.poll(() => intakeRegistry.rumActionEvents.length).toBe(2)

      const view = intakeRegistry.rumViewEvents.at(-1)!
      expect(view.view.url).toBe(`https://shop.example${CHECKOUT_PATH}`)
      expect(view.view.referrer).toBe(STOREFRONT_REFERRER)
      expect(view.display?.viewport).toEqual({ width: 1280, height: 800 })

      const [checkoutStarted, click] = intakeRegistry.rumActionEvents
      expect(checkoutStarted.action.target?.name).toBe('checkout_started')
      expect(checkoutStarted.context).toEqual({ checkout: { token: 'checkout-token', currencyCode: 'USD' } })
      expect(click.action.type).toBe('click')
      expect(click.action.target?.name).toBe('pay')

      // Any unguarded browser API would show up as an SDK error
      expect(intakeRegistry.telemetryErrorEvents).toHaveLength(0)
      withBrowserLogs((logs) => expect(logs.filter((log) => log.level === 'error')).toHaveLength(0))
    })
})
