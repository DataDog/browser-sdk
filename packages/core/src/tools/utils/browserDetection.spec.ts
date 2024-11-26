import { combine } from '../mergeInto'
import { Browser, detectBrowser } from './browserDetection'

describe('browserDetection', () => {
  it('detects Safari', () => {
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
            vendor: 'Apple Computer, Inc.',
          },
        })
      )
    ).toBe(Browser.SAFARI)

    // Emulates Safari detection if 'navigator.vendor' is removed one day
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
          },
        })
      )
    ).toBe(Browser.SAFARI)

    // Webview on iOS
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 16_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/20B110 [FBAN/FBIOS;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/16.1.2;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5]',
            vendor: 'Apple Computer, Inc.',
          },
        })
      )
    ).toBe(Browser.SAFARI)
  })

  it('detects Chromium', () => {
    // Google Chrome 118
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent:
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
            vendor: 'Google Inc.',
          },
          chrome: {},
        })
      )
    ).toBe(Browser.CHROMIUM)

    // Headless chrome
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent:
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/92.0.4512.0 Safari/537.36',
            vendor: 'Google Inc.',
          },
        })
      )
    ).toBe(Browser.CHROMIUM)

    // Microsoft Edge 89
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent:
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36 Edg/89.0.774.54',
            vendor: 'Google Inc.',
          },
          chrome: {},
        })
      )
    ).toBe(Browser.CHROMIUM)
  })

  it('other browsers', () => {
    // Firefox 10
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: { userAgent: 'Mozilla/5.0 (X11; Linux i686; rv:10.0) Gecko/20100101 Firefox/10.0' },
        })
      )
    ).toBe(Browser.OTHER)

    // Firefox 120
    expect(
      detectBrowser(
        fakeWindowWithDefaults({
          navigator: {
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
          },
        })
      )
    ).toBe(Browser.OTHER)
  })

  function fakeWindowWithDefaults(partial: any): Window {
    return combine(
      {
        navigator: {
          userAgent: '',
        },
        document: {},
      },
      partial
    ) as Window
  }
})
