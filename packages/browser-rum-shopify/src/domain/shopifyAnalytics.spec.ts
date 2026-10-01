import { pageViewedEvent } from '../../test/mockShopifyAnalytics'
import { isCheckoutPage } from './shopifyAnalytics'

describe('isCheckoutPage', () => {
  it('matches /checkout, /checkouts/* and locale-prefixed checkout paths', () => {
    const urls = [
      'https://shop.example/checkout',
      'https://shop.example/checkouts/abc123',
      'https://shop.example/en-us/checkout',
    ]

    for (const url of urls) {
      expect(isCheckoutPage(pageViewedEvent(url)))
        .withContext(url)
        .toBeTrue()
    }
  })

  it('does not match storefront, /orders/*, Customer Account pages or an undefined url', () => {
    const urls = [
      'https://shop.example/products/foo',
      'https://shop.example/orders/abc123',
      'https://shop.example/account/orders',
      undefined,
    ]

    for (const url of urls) {
      expect(isCheckoutPage(pageViewedEvent(url)))
        .withContext(String(url))
        .toBeFalse()
    }
  })
})
