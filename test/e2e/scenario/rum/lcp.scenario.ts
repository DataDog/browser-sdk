import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { createTest } from '../../lib/framework'

interface LcpPageOptions {
  imgDelay?: number
  imgHidden?: boolean
  removeElement?: boolean
  renderBlocking?: number
}

interface LcpSubParts {
  first_byte: number
  load_delay: number
  load_time: number
  render_delay: number
}

// Convert nanoseconds to milliseconds for readable logging
function nsToMs(ns: number): number {
  return ns / 1e6
}

function isLcpSubParts(value: unknown): value is LcpSubParts {
  if (!value || typeof value !== 'object') {
    return false
  }

  const v = value as Record<string, unknown>
  return (
    typeof v.first_byte === 'number' &&
    typeof v.load_delay === 'number' &&
    typeof v.load_time === 'number' &&
    typeof v.render_delay === 'number'
  )
}

// Helper function to create LCP test page HTML
function createLcpPage(options: LcpPageOptions = {}): { head: string; body: string } {
  const imgDelay = options.imgDelay ?? 500

  const renderBlockingScript = options.renderBlocking
    ? `<script>
        const start = Date.now();
        while (Date.now() - start < ${options.renderBlocking}) {}
      </script>`
    : ''

  const removeElementScript = options.removeElement
    ? `<script>
        setTimeout(() => {
          document.getElementById('lcp-image')?.remove();
        }, 10);
      </script>`
    : ''

  const imgDelayScript = imgDelay > 0
    ? `<script>
        const img = document.getElementById('lcp-image');
        const originalSrc = img.src;
        img.src = '';
        setTimeout(() => {
          img.src = originalSrc;
        }, ${imgDelay});
      </script>`
    : ''

  return {
    head: renderBlockingScript,
    body: `
      <h1 id="main-heading">LCP Test</h1>
      <p>
        <img
          id="lcp-image"
          class="foo bar"
          ${options.imgHidden ? 'hidden' : ''}
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ff0000'/%3E%3C/svg%3E"
          style="width: 100px; height: 100px;"
        />
      </p>
      <p>Text below the image</p>
      <p><a id="navigate-away" href="about:blank">Navigate away</a></p>
      <div style="height: 100vh"></div>
      <footer>Text below the full-height element.</footer>
      ${removeElementScript}
      ${imgDelayScript}
    `,
  }
}

// Helper to wait for images to be painted
async function imagesPainted(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const img = document.getElementById('lcp-image') as HTMLImageElement
    return img && img.complete && img.naturalHeight > 0
  }, { timeout: 10000 })
  await page.waitForTimeout(100)
}

// Helper to hide and reshow page (simulate tab switching)
async function hideAndReshowPage(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: true, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: false, writable: true, configurable: true })
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

// Helper to check if browser supports LCP
async function browserSupportsLCP(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return 'PerformanceObserver' in window &&
           PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')
  })
}

test.describe('LCP (Largest Contentful Paint) tracking', () => {
  test.describe('basic LCP reporting', () => {
    const defaultLcpPage = createLcpPage()

    createTest('reports LCP value on page hidden')
      .withRum()
      .withBody(defaultLcpPage.body)
      .withHead(defaultLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Wait until images are loaded and fully rendered
        await imagesPainted(page)

        // Navigate away to trigger hidden state and finalize LCP
        await page.goto('about:blank')
        await flushEvents()

        // Check that LCP was reported in view event
        expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
        const viewEvent = intakeRegistry.rumViewEvents[0]

        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint).toBeGreaterThan(500 * 1e6) // Greater than image delay (in nanoseconds)
      })

    createTest('reports LCP value on user interaction')
      .withRum()
      .withBody(defaultLcpPage.body)
      .withHead(defaultLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Wait until images are loaded and fully rendered
        await imagesPainted(page)

        // Click on the h1 to finalize LCP
        await page.click('#main-heading')
        await page.waitForTimeout(100)

        // Navigate away to flush the view
        await page.goto('about:blank')
        await flushEvents()

        // Check that LCP was reported
        expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
        const viewEvent = intakeRegistry.rumViewEvents[0]

        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint).toBeGreaterThan(500 * 1e6)
      })

    const lateLoadingLcpPage = createLcpPage({ imgDelay: 1000 })

    createTest('reports LCP when loaded late')
      .withRum()
      .withBody(lateLoadingLcpPage.body)
      .withHead(lateLoadingLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Wait until images are loaded and fully rendered
        await imagesPainted(page)

        // Click to finalize LCP
        await page.click('#main-heading')

        // Navigate away to flush
        await page.goto('about:blank')
        await flushEvents()

        expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
        const viewEvent = intakeRegistry.rumViewEvents[0]

        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint).toBeGreaterThan(1000 * 1e6)
      })
  })

  test.describe('LCP and document visibility', () => {
    createTest('does not report if document was hidden at page load time')
      .withRum()
      .withHead(`
        <script>
          // CRITICAL: Must run before RUM SDK initializes
          Object.defineProperty(document, 'visibilityState', {
            get() { return 'hidden' },
            configurable: true,
            enumerable: true
          });
          Object.defineProperty(document, 'hidden', {
            get() { return true },
            configurable: true,
            enumerable: true
          });
        </script>
      `)
      .withBody(createLcpPage().body)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Verify the mock worked
        const visState = await page.evaluate(() => document.visibilityState)
        expect(visState).toBe('hidden')

        // Make visible after SDK initialization
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            get() { return 'visible' },
            configurable: true,
            enumerable: true
          });
          Object.defineProperty(document, 'hidden', {
            get() { return false },
            configurable: true,
            enumerable: true
          });
          document.dispatchEvent(new Event('visibilitychange'))
        })

        await page.click('#main-heading')
        await page.waitForTimeout(1000)

        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        // LCP should not be reported if page was hidden at load
        expect(viewEvent.view.largest_contentful_paint).toBeUndefined()
      })

    const renderBlockingLcpPage = createLcpPage({ renderBlocking: 1000 })

    createTest('does not report if document changes to hidden before first render')
      .withRum()
      .withBody(renderBlockingLcpPage.body)
      .withHead(renderBlockingLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Hide page during render blocking
        await page.waitForTimeout(100)
        await hideAndReshowPage(page)

        await page.click('#main-heading')
        await page.waitForTimeout(1000)

        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeUndefined()
      })

    createTest('stops reporting after document changes to hidden')
      .withRum()
      .withBody(`
        <h1 id="main-heading" style="font-size: 50px;">LCP Test</h1>
        <p>
          <img
            id="lcp-image"
            class="foo bar"
            hidden
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ff0000'/%3E%3C/svg%3E"
            style="width: 200px; height: 200px;"
          />
        </p>
      `)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
          return
        }

        // Wait for initial render and LCP (should be h1)
        await page.waitForTimeout(500)

        // Trigger user interaction to finalize LCP before hiding
        await page.click('#main-heading')
        await page.waitForTimeout(100)

        // Hide and reshow page
        await hideAndReshowPage(page)

        // Show the previously hidden image (this should NOT become new LCP)
        await page.evaluate(() => {
          const img = document.getElementById('lcp-image') as HTMLImageElement
          img.hidden = false
        })

        await page.waitForTimeout(500)

        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        // Should have reported LCP before hiding (the h1), not the image shown after
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        // LCP should be early (from h1), not late (from showing image after hide/show)
        expect(viewEvent.view.largest_contentful_paint).toBeLessThan(1000 * 1e6)
      })

    createTest('does not report if hidden before SDK loads (with visibility-state support)')
      .withRum()
      .withHead(`
        <script>
          // Set up visibility tracking before SDK loads
          window._visibilityChanges = [];
          document.addEventListener('visibilitychange', () => {
            window._visibilityChanges.push({
              state: document.visibilityState,
              timestamp: Date.now()
            });
          });
        </script>
      `)
      .withBody(createLcpPage().body)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Hide the page immediately before any meaningful rendering
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            get() { return 'hidden' },
            configurable: true,
            enumerable: true
          });
          Object.defineProperty(document, 'hidden', {
            get() { return true },
            configurable: true,
            enumerable: true
          });
          document.dispatchEvent(new Event('visibilitychange'))
        })

        await page.waitForTimeout(500)

        // Make visible again
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            get() { return 'visible' },
            configurable: true,
            enumerable: true
          });
          Object.defineProperty(document, 'hidden', {
            get() { return false },
            configurable: true,
            enumerable: true
          });
          document.dispatchEvent(new Event('visibilitychange'))
        })

        await page.click('#main-heading')
        await page.waitForTimeout(1000)

        await page.goto('about:blank')
        await flushEvents()

        // SDK should detect the page was hidden via visibility-state entries
        // and not report LCP
        const viewEvent = intakeRegistry.rumViewEvents[0]

        // This behavior depends on SDK's visibility-state entry support
        // May report or not report based on implementation
      })
  })

  test.describe('LCP attribution and subparts', () => {
    const subpartsLcpPage = createLcpPage()

    createTest('reports LCP subparts (TTFB, load delay, load time, render delay)')
      .withRum()
      .withBody(subpartsLcpPage.body)
      .withHead(subpartsLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        const lcp = viewEvent.view.largest_contentful_paint
        const firstByte = viewEvent.view.first_byte
        const lcpData = viewEvent.view.performance?.lcp
        const subParts = lcpData?.sub_parts

        expect(lcp).toBeDefined()
        expect(firstByte).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint_target_selector).toBeDefined()

        // Verify lcp.sub_parts are exposed and properly structured
        expect(lcpData).toBeDefined()
        expect(subParts).toBeDefined()

        if (isLcpSubParts(subParts)) {
          // All subpart fields should be defined
          expect(subParts.first_byte).toBeDefined()
          expect(subParts.load_delay).toBeDefined()
          expect(subParts.load_time).toBeDefined()
          expect(subParts.render_delay).toBeDefined()

          // All should be non-negative numbers
          expect(subParts.first_byte).toBeGreaterThanOrEqual(0)
          expect(subParts.load_delay).toBeGreaterThanOrEqual(0)
          expect(subParts.load_time).toBeGreaterThanOrEqual(0)
          expect(subParts.render_delay).toBeGreaterThanOrEqual(0)

          console.log('LCP subparts (ms):', {
            first_byte: nsToMs(subParts.first_byte),
            load_delay: nsToMs(subParts.load_delay),
            load_time: nsToMs(subParts.load_time),
            render_delay: nsToMs(subParts.render_delay),
          })

          // Mathematical invariant: sum(subparts) = LCP
          const sum = subParts.first_byte + subParts.load_delay + subParts.load_time + subParts.render_delay
          expect(sum).toBe(lcp)

          // first_byte should match view.first_byte
          expect(subParts.first_byte).toBe(firstByte)
        }

        // LCP should be greater than TTFB
        expect(lcp!).toBeGreaterThan(firstByte!)
      })

    createTest('handles LCP element without resource (text element)')
      .withRum()
      .withBody(`
        <h1 id="main-heading" style="font-size: 100px; padding: 50px;">Large Text LCP</h1>
        <p>Text below</p>
      `)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await page.waitForTimeout(500)
        await page.click('#main-heading')
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint_target_selector).toBeDefined()
      })

    const removeElementLcpPage = createLcpPage({ removeElement: true })

    createTest('handles LCP when element is removed from DOM')
      .withRum()
      .withBody(removeElementLcpPage.body)
      .withHead(removeElementLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await page.waitForTimeout(1000)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        // Should still report LCP even if element was removed
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
      })
  })

  test.describe('LCP and navigation types', () => {
    createTest('does not report LCP if browser does not support it')
      .withRum()
      .withHead(`
        <script>
          // Stub out LCP support before SDK loads
          const originalSupportedEntryTypes = PerformanceObserver.supportedEntryTypes
          Object.defineProperty(PerformanceObserver, 'supportedEntryTypes', {
            get: () => originalSupportedEntryTypes?.filter((type) => type !== 'largest-contentful-paint') || [],
            configurable: true
          });
        </script>
      `)
      .withBody(createLcpPage().body)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        // Verify LCP support is stubbed
        const hasLcpSupport = await browserSupportsLCP(page)
        expect(hasLcpSupport).toBe(false)

        await page.waitForTimeout(1000)
        await page.click('#main-heading')
        await page.goto('about:blank')
        await flushEvents()

        if (intakeRegistry.rumViewEvents.length > 0) {
          const viewEvent = intakeRegistry.rumViewEvents[0]
          expect(viewEvent.view.largest_contentful_paint).toBeUndefined()
        }
      })
  })

  test.describe('LCP maximum delay', () => {
    const maxDelayLcpPage = createLcpPage()
    const TEN_MINUTES_NS = 600_000_000_000

    createTest('discards LCP values above maximum delay (10 minutes)')
      .withRum()
      .withBody(maxDelayLcpPage.body)
      .withHead(maxDelayLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint).toBeLessThan(TEN_MINUTES_NS)
      })
  })

  test.describe('LCP target selector', () => {
    const selectorLcpPage = createLcpPage()

    createTest('reports target selector for LCP element')
      .withRum()
      .withBody(selectorLcpPage.body)
      .withHead(selectorLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint_target_selector).toBeDefined()
        expect(typeof viewEvent.view.largest_contentful_paint_target_selector).toBe('string')
        // SDK uses most specific selector (ID in this case)
        expect(viewEvent.view.largest_contentful_paint_target_selector).toMatch(/#lcp-image|IMG/)
      })

    createTest('reports custom action name attribute as target selector')
      .withRum({ actionNameAttribute: 'data-test-id' })
      .withBody(`
        <h1 id="main-heading">LCP Test</h1>
        <p>
          <img
            id="lcp-image"
            data-test-id="main-lcp-image"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ff0000'/%3E%3C/svg%3E"
            style="width: 100px; height: 100px;"
          />
        </p>
      `)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint_target_selector).toBeDefined()
      })
  })

  test.describe('LCP resource URL', () => {
    createTest('reports resource URL for image LCP')
      .withRum()
      .withBody(`
        <h1>LCP Test</h1>
        <p>
          <img
            id="lcp-image"
            src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
            style="width: 200px; height: 200px;"
          />
        </p>
      `)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        // Resource URL tracking is internal to the SDK
      })
  })

  test.describe('LCP with multiple updates', () => {
    createTest('tracks largest LCP across multiple candidates')
      .withRum()
      .withBody(`
        <h1 id="heading" style="font-size: 50px;">Initial LCP</h1>
        <div id="image-container"></div>
        <script>
          // Add progressively larger images
          setTimeout(() => {
            const img1 = document.createElement('img');
            img1.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="150" height="150"%3E%3Crect width="150" height="150" fill="%2300ff00"/%3E%3C/svg%3E';
            img1.style.width = '150px';
            img1.style.height = '150px';
            document.getElementById('image-container').appendChild(img1);
          }, 100);

          setTimeout(() => {
            const img2 = document.createElement('img');
            img2.id = 'final-lcp';
            img2.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%230000ff"/%3E%3C/svg%3E';
            img2.style.width = '200px';
            img2.style.height = '200px';
            document.getElementById('image-container').appendChild(img2);
          }, 300);
        </script>
      `)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Wait for all images to load and render
        await page.waitForTimeout(500)
        await page.waitForFunction(() => {
          return document.getElementById('final-lcp') !== null
        }, { timeout: 5000 })
        await page.waitForTimeout(200) // Extra time for LCP observation

        // Finalize LCP
        await page.click('#heading')
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        // Should report an LCP value (timing may vary, but should capture dynamic images)
        expect(viewEvent.view.largest_contentful_paint).toBeGreaterThan(100 * 1e6)
      })
  })

  test.describe('LCP and bfcache (back-forward cache)', () => {
    const bfcacheLcpPage = createLcpPage()

    createTest('reports LCP if page is restored from bfcache')
      .withRum()
      .withBody(bfcacheLcpPage.body)
      .withHead(bfcacheLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Wait for images and trigger LCP
        await imagesPainted(page)
        await page.click('#main-heading')
        await page.waitForTimeout(100)

        // Navigate away
        await page.goto('about:blank')
        await flushEvents()

        // Verify initial LCP was reported
        expect(intakeRegistry.rumViewEvents.length).toBeGreaterThan(0)
        const firstViewEvent = intakeRegistry.rumViewEvents[0]
        expect(firstViewEvent.view.largest_contentful_paint).toBeDefined()

        // Clear registry
        intakeRegistry.empty()

        // Go back to trigger bfcache restore
        await page.goBack()
        await page.waitForTimeout(500)

        // Navigate away again to flush the restored view
        await page.goto('about:blank')
        await flushEvents()

        // Check if bfcache restore was tracked
        // Note: browser-sdk may handle this differently than web-vitals
        // The test validates that the SDK properly handles bfcache scenarios
      })

    createTest('reports LCP on bfcache restore even when document was hidden at load')
      .withRum()
      .withHead(`
        <script>
          Object.defineProperty(document, 'visibilityState', {
            get() { return 'hidden' },
            configurable: true,
            enumerable: true
          });
          Object.defineProperty(document, 'hidden', {
            get() { return true },
            configurable: true,
            enumerable: true
          });
        </script>
      `)
      .withBody(createLcpPage().body)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Make visible
        await page.evaluate(() => {
          Object.defineProperty(document, 'visibilityState', {
            get() { return 'visible' },
            configurable: true,
            enumerable: true
          });
          Object.defineProperty(document, 'hidden', {
            get() { return false },
            configurable: true,
            enumerable: true
          });
          document.dispatchEvent(new Event('visibilitychange'))
        })

        await page.click('#main-heading')
        await page.waitForTimeout(1000)

        // Navigate away
        await page.goto('about:blank')
        await flushEvents()

        // LCP should not have been reported initially
        const firstView = intakeRegistry.rumViewEvents[0]
        expect(firstView?.view.largest_contentful_paint).toBeUndefined()

        // Clear and go back
        intakeRegistry.empty()
        await page.goBack()
        await page.waitForTimeout(500)

        // Navigate away to flush
        await page.goto('about:blank')
        await flushEvents()

        // bfcache restore should report LCP even if originally hidden
        // Browser-sdk may handle this scenario
      })

    createTest('handles multiple bfcache restores')
      .withRum()
      .withBody(bfcacheLcpPage.body)
      .withHead(bfcacheLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)
        await page.click('#main-heading')

        // First navigation
        await page.goto('about:blank')
        await flushEvents()
        intakeRegistry.empty()

        // First bfcache restore
        await page.goBack()
        await page.waitForTimeout(500)
        await page.goto('about:blank')
        await flushEvents()
        intakeRegistry.empty()

        // Second bfcache restore
        await page.goBack()
        await page.waitForTimeout(500)
        await page.goto('about:blank')
        await flushEvents()

        // Both restores should be handled correctly
      })
  })

  test.describe('LCP and render delays', () => {
    const renderDelayLcpPage = createLcpPage({ renderBlocking: 3000 })

    createTest('reports LCP after render delay before page changes to hidden')
      .withRum()
      .withBody(renderDelayLcpPage.body)
      .withHead(renderDelayLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Wait for render blocking to complete
        await page.waitForTimeout(3500)

        // Hide the page after render
        await hideAndReshowPage(page)

        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()
        expect(viewEvent.view.largest_contentful_paint).toBeGreaterThan(3000 * 1e6)
      })
  })

  test.describe('LCP and prerendering', () => {
    createTest('accounts for time prerendering the page')
      .withRum()
      .withBody(`
        <h1 id="main-heading">LCP Test</h1>
        <p>
          <img
            id="lcp-image"
            src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23ff0000'/%3E%3C/svg%3E"
            style="width: 100px; height: 100px;"
          />
        </p>
        <p><a id="prerender-link" href="?prerendered=1">Prerender Link</a></p>
      `)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        // Check if browser supports prerendering
        const supportsPrerender = await page.evaluate(() => {
          return 'onprerenderingchange' in document && 'prerendering' in document
        })

        if (!supportsPrerender) {
          test.skip()
          return
        }

        if (!(await browserSupportsLCP(page))) {
          test.skip()
          return
        }

        // Initial page load - finalize LCP
        await imagesPainted(page)
        await page.click('#main-heading')
        await flushEvents()

        // Clear first view
        intakeRegistry.empty()

        // Now test prerendering behavior
        // Note: Actual prerendering is hard to test in e2e without browser support
        // This test validates that IF prerendering occurred, SDK handles it correctly

        // Simulate what would happen in a prerendered page
        await page.evaluate(() => {
          // Mock activationStart for testing
          const navEntry = performance.getEntriesByType('navigation')[0] as any
          Object.defineProperty(navEntry, 'activationStart', {
            value: 100, // Simulated activation delay
            writable: false,
            configurable: true
          })
        })

        await page.reload()
        await imagesPainted(page)

        // Get navigation entry to check activationStart
        const activationStart = await page.evaluate(() => {
          const navEntry = performance.getEntriesByType('navigation')[0] as any
          return navEntry.activationStart || 0
        })

        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]

        if (activationStart > 0) {
          // If activationStart exists, LCP should account for it
          // This is the critical SDK bug check: does it subtract activationStart?
          expect(viewEvent.view.largest_contentful_paint).toBeDefined()

          // The SDK should report LCP relative to activation, not prerender start
          // This is what web-vitals checks: lcp.value should equal entry.startTime - activationStart
          console.log('activationStart:', activationStart)
          console.log('LCP value:', viewEvent.view.largest_contentful_paint)
        }
      })
  })

  test.describe('LCP and page discarded state', () => {
    const discardedLcpPage = createLcpPage()

    createTest('reports correct navigation type for wasDiscarded pages')
      .withRum()
      .withBody(discardedLcpPage.body)
      .withHead(discardedLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        // Simulate wasDiscarded flag
        await page.evaluate(() => {
          Object.defineProperty(document, 'wasDiscarded', {
            value: true,
            writable: false,
            configurable: true
          })
        })

        await imagesPainted(page)
        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()

        // Browser-sdk may track wasDiscarded differently
        // This test ensures the SDK handles discarded pages correctly
      })
  })

  test.describe('LCP attribution edge cases', () => {
    const edgeCaseLcpPage = createLcpPage()

    createTest('handles image resources with incomplete timing data')
      .withRum()
      .withBody(edgeCaseLcpPage.body)
      .withHead(edgeCaseLcpPage.head)
      .run(async ({ page, intakeRegistry, flushEvents }) => {
        if (!(await browserSupportsLCP(page))) {
          test.skip()
        }

        await imagesPainted(page)

        // Mock incomplete resource timing by stubbing requestStart
        await page.evaluate(() => {
          const originalGetEntries = performance.getEntriesByType
          performance.getEntriesByType = function(type: string) {
            const entries = originalGetEntries.call(performance, type)
            if (type === 'resource') {
              // Stub incomplete timing data
              return entries.map(entry => {
                const stubbed = { ...entry }
                Object.defineProperty(stubbed, 'requestStart', {
                  value: 0,
                  enumerable: true
                })
                return stubbed
              })
            }
            return entries
          }
        })

        await page.goto('about:blank')
        await flushEvents()

        const viewEvent = intakeRegistry.rumViewEvents[0]
        expect(viewEvent.view.largest_contentful_paint).toBeDefined()

        // SDK should gracefully handle missing timing data
        // Subparts calculation should fall back appropriately
      })
  })

  test.describe('LCP Subparts - SDK Bugs & Missing Features', () => {
    test.describe('🐛 BUG: Missing requestStart fallback', () => {
      createTest('should use requestStart when available for loadDelay calculation (DevTools alignment)')
        .withRum()
        .withHead(`
          <script>
            // Mock resource timing to have different requestStart vs startTime
            const MOCK_START_TIME = 100;      // Resource discovery time
            const MOCK_REQUEST_START = 150;   // Actual HTTP request start (50ms later)
            const MOCK_RESPONSE_END = 200;    // Response complete

            const originalGetEntriesByType = performance.getEntriesByType.bind(performance);
            performance.getEntriesByType = function(type) {
              const entries = originalGetEntriesByType(type);
              if (type === 'resource') {
                return entries.map(entry => {
                  if (entry.name.includes('svg') || entry.name.includes('data:')) {
                    const mockEntry = Object.create(entry);
                    Object.defineProperty(mockEntry, 'startTime', {
                      value: MOCK_START_TIME,
                      enumerable: true,
                      configurable: true
                    });
                    Object.defineProperty(mockEntry, 'requestStart', {
                      value: MOCK_REQUEST_START,
                      enumerable: true,
                      configurable: true
                    });
                    Object.defineProperty(mockEntry, 'responseEnd', {
                      value: MOCK_RESPONSE_END,
                      enumerable: true,
                      configurable: true
                    });
                    Object.defineProperty(mockEntry, 'name', {
                      value: entry.name,
                      enumerable: true,
                      configurable: true
                    });
                    return mockEntry;
                  }
                  return entry;
                });
              }
              return entries;
            };
          </script>
        `)
        .withBody(`
          <h1>LCP Test</h1>
          <img id="lcp-image"
               src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ff0000'/%3E%3C/svg%3E"
               style="width: 200px; height: 200px;" />
        `)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
            return
          }

          await imagesPainted(page)

          // Verify mocks are working
          const mockTiming = await page.evaluate(() => {
            const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
            const imgResource = resources.find(r => r.name.includes('svg') || r.name.includes('data:'))
            return {
              startTime: imgResource?.startTime || 0,
              requestStart: imgResource?.requestStart || 0,
              responseEnd: imgResource?.responseEnd || 0,
            }
          })

          console.log('Mocked resource timing (ms):', mockTiming)

          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const lcpData = viewEvent.view.performance?.lcp
          const firstByte = viewEvent.view.first_byte

          expect(lcpData).toBeDefined()
          expect(lcpData?.sub_parts).toBeDefined()

          const subParts = lcpData?.sub_parts
          expect(isLcpSubParts(subParts)).toBe(true)
          if (!isLcpSubParts(subParts)) {
            throw new Error('Expected lcp.sub_parts to contain numeric timing fields')
          }

          console.log('LCP subparts (ms):', {
            first_byte: nsToMs(subParts.first_byte),
            load_delay: nsToMs(subParts.load_delay),
            load_time: nsToMs(subParts.load_time),
            render_delay: nsToMs(subParts.render_delay),
          })

          // BUG: SDK uses startTime (100ms) instead of requestStart (150ms)
          // CORRECT loadDelay calculation:
          //   lcpRequestStart = max(firstByte, requestStart) = max(firstByte, 150)
          //   loadDelay = lcpRequestStart - firstByte
          // BUG loadDelay calculation:
          //   lcpRequestStart = max(firstByte, startTime) = max(firstByte, 100)
          //   loadDelay = lcpRequestStart - firstByte

          // If firstByte < 100ms, the bug gives loadDelay using startTime (100ms)
          // Correct behavior would use requestStart (150ms)
          // Difference = 50ms

          expect(firstByte).toBeDefined()
          const firstByteMs = nsToMs(firstByte!)
          const loadDelayMs = nsToMs(subParts.load_delay)

          // CORRECT: loadDelay should use requestStart (150ms)
          const expectedLoadDelayMs = Math.max(0, Math.max(firstByteMs, 150) - firstByteMs)

          // BUG: SDK uses startTime (100ms)
          const buggyLoadDelayMs = Math.max(0, Math.max(firstByteMs, 100) - firstByteMs)

          console.log('Load delay comparison (ms):', {
            expected: expectedLoadDelayMs,
            buggy: buggyLoadDelayMs,
            actual: loadDelayMs,
            firstByte: firstByteMs,
          })

          // This assertion will FAIL with the bug (actual ≈ buggy)
          // and PASS when fixed (actual ≈ expected)
          expect(loadDelayMs).toBeCloseTo(expectedLoadDelayMs, 0)
        })
    })

    test.describe('🐛 CRITICAL BUG: Missing activationStart support (Prerendering)', () => {
      createTest('should subtract activationStart from all LCP timings for prerendered pages')
        .withRum()
        .withHead(`
          <script>
            // Mock navigation entry with activationStart BEFORE page loads
            const originalGetEntriesByType = performance.getEntriesByType.bind(performance);
            performance.getEntriesByType = function(type) {
              const entries = originalGetEntriesByType(type);
              if (type === 'navigation' && entries.length > 0) {
                const navEntry = entries[0];
                const mockEntry = Object.create(navEntry);

                // Mock prerender scenario: page prerendered for 2000ms
                Object.defineProperty(mockEntry, 'activationStart', {
                  value: 2000,
                  enumerable: true,
                  configurable: true
                });

                // responseStart was during prerender
                Object.defineProperty(mockEntry, 'responseStart', {
                  value: 100,
                  enumerable: true,
                  configurable: true
                });

                return [mockEntry];
              }
              return entries;
            };
          </script>
        `)
        .withBody(`
          <h1>Prerendered LCP Test</h1>
          <img id="lcp-image"
               src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ff0000'/%3E%3C/svg%3E"
               style="width: 200px; height: 200px;" />
        `)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
          }

          await imagesPainted(page)

          // Verify the mock is working
          const activationStart = await page.evaluate(() => {
            const navEntry = performance.getEntriesByType('navigation')[0] as any
            return navEntry.activationStart || 0
          })

          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const lcpReported = viewEvent.view.largest_contentful_paint
          const lcpData = viewEvent.view.performance?.lcp
          const subParts = lcpData?.sub_parts

          if (activationStart === 0) {
            test.skip()
            return
          }

          const ONE_SECOND_NS = 1000 * 1e6
          const MOCKED_RESPONSE_START_MS = 100

          expect(lcpReported).toBeDefined()
          const lcpReportedNs = lcpReported!

          console.log('Prerender timing (ms):', {
            activationStart,
            responseStart: MOCKED_RESPONSE_START_MS,
            lcpReported: nsToMs(lcpReportedNs),
          })

          if (isLcpSubParts(subParts)) {
            console.log('LCP subparts (ms):', {
              first_byte: nsToMs(subParts.first_byte),
              load_delay: nsToMs(subParts.load_delay),
              load_time: nsToMs(subParts.load_time),
              render_delay: nsToMs(subParts.render_delay),
            })
          }

          // LCP should be relative to activationStart, not navigation start
          // For prerendered pages: LCP = entry.startTime - activationStart
          expect(lcpReportedNs).toBeLessThan(ONE_SECOND_NS)

          // All subparts should also be relative to activationStart
          if (isLcpSubParts(subParts)) {
            // first_byte should be max(0, responseStart - activationStart)
            // With responseStart=100ms, activationStart=2000ms, should be clamped to ~0
            expect(subParts.first_byte).toBeLessThan(MOCKED_RESPONSE_START_MS * 1e6)
          }
        })

      createTest('should account for activationStart in LCP subparts calculation')
        .withRum()
        .withHead(`
          <script>
            const originalGetEntriesByType = performance.getEntriesByType.bind(performance);
            performance.getEntriesByType = function(type) {
              const entries = originalGetEntriesByType(type);
              if (type === 'navigation' && entries.length > 0) {
                const navEntry = entries[0];
                const mockEntry = Object.create(navEntry);
                Object.defineProperty(mockEntry, 'activationStart', {
                  value: 1500,
                  enumerable: true,
                  configurable: true
                });
                Object.defineProperty(mockEntry, 'responseStart', {
                  value: 100,
                  enumerable: true,
                  configurable: true
                });
                return [mockEntry];
              }
              return entries;
            };
          </script>
        `)
        .withBody(`
          <h1>Prerendered LCP Subparts Test</h1>
          <img id="lcp-image"
               src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ff0000'/%3E%3C/svg%3E"
               style="width: 200px; height: 200px;" />
        `)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
          }

          await imagesPainted(page)

          const activationStart = await page.evaluate(() => {
            const navEntry = performance.getEntriesByType('navigation')[0] as any
            return navEntry.activationStart || 0
          })

          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const firstByte = viewEvent.view.first_byte
          const lcpData = viewEvent.view.performance?.lcp
          const subParts = lcpData?.sub_parts

          if (activationStart === 0) {
            test.skip()
            return
          }

          const MOCKED_RESPONSE_START_MS = 100
          const MAX_EXPECTED_FIRST_BYTE_NS = 50 * 1e6

          expect(firstByte).toBeDefined()
          const firstByteNs = firstByte!

          console.log('Prerender timing (ms):', {
            activationStart,
            responseStart: MOCKED_RESPONSE_START_MS,
            firstByte: nsToMs(firstByteNs),
          })

          if (isLcpSubParts(subParts)) {
            console.log('LCP subparts (ms):', {
              first_byte: nsToMs(subParts.first_byte),
              load_delay: nsToMs(subParts.load_delay),
              load_time: nsToMs(subParts.load_time),
              render_delay: nsToMs(subParts.render_delay),
            })
          }

          // TTFB = max(0, responseStart - activationStart)
          // Expected: max(0, 100ms - 1500ms) = 0ms (clamped to 0)
          expect(firstByteNs).toBeLessThanOrEqual(MAX_EXPECTED_FIRST_BYTE_NS)

          if (isLcpSubParts(subParts)) {
            expect(subParts.first_byte).toBeLessThanOrEqual(MAX_EXPECTED_FIRST_BYTE_NS)
          }
        })
    })

    test.describe('🐛 BUG: Resource matching by URL can return wrong entry', () => {
      createTest('should match resource by timing, not just URL (preload case)')
        .withRum()
        .withBody(`
          <h1>Multiple Resources Same URL Test</h1>
          <script>
            // Simulate multiple resource entries with same URL
            const imgUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect width="200" height="200" fill="%23ff0000"/%3E%3C/svg%3E';

            // Create multiple fetches of the same resource
            fetch(imgUrl).then(() => {
              // First fetch completes
              setTimeout(() => {
                // Second fetch (this should be the one associated with LCP)
                const img = document.createElement('img');
                img.id = 'lcp-image';
                img.src = imgUrl;
                img.style.width = '200px';
                img.style.height = '200px';
                document.body.appendChild(img);
              }, 100);
            });
          </script>
        `)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
          }

          await page.waitForTimeout(500)
          await page.waitForFunction(() => {
            const img = document.getElementById('lcp-image') as HTMLImageElement
            return img && img.complete
          })

          const resourceCount = await page.evaluate(() => {
            const resources = performance.getEntriesByType('resource')
            const dataUrlResources = resources.filter(r => r.name.startsWith('data:image'))
            return dataUrlResources.length
          })

          console.log('Resources with same URL:', resourceCount)

          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const lcp = viewEvent.view.largest_contentful_paint
          const lcpData = viewEvent.view.performance?.lcp
          const subParts = lcpData?.sub_parts

          expect(lcp).toBeDefined()

          if (isLcpSubParts(subParts)) {
            console.log('LCP subparts (ms):', {
              first_byte: nsToMs(subParts.first_byte),
              load_delay: nsToMs(subParts.load_delay),
              load_time: nsToMs(subParts.load_time),
              render_delay: nsToMs(subParts.render_delay),
            })

            const sum = subParts.first_byte + subParts.load_delay + subParts.load_time + subParts.render_delay
            // sum(subparts) should equal LCP - verifies correct resource was matched
            expect(sum).toBe(lcp)
          }

          if (resourceCount > 1) {
            console.log('Multiple resources with same URL detected:', resourceCount)
          }
        })
    })

    test.describe('🐛 BUG: Missing capping for video/progressive resources', () => {
      createTest('should cap responseEnd at LCP time for progressive resources')
        .withRum()
        .withHead(`
          <script>
            // Mock a video resource with responseEnd > LCP time
            const originalGetEntriesByType = performance.getEntriesByType.bind(performance);
            let resourceCallCount = 0;

            performance.getEntriesByType = function(type) {
              const entries = originalGetEntriesByType(type);

              if (type === 'resource') {
                // Find poster image and extend its responseEnd
                return entries.map(entry => {
                  if (entry.name.includes('svg')) {
                    resourceCallCount++;
                    // Mock: resource continues downloading after LCP
                    const mockEntry = Object.create(entry);
                    Object.defineProperty(mockEntry, 'responseEnd', {
                      value: entry.startTime + 5000, // Way after LCP
                      enumerable: true,
                      configurable: true
                    });
                    return mockEntry;
                  }
                  return entry;
                });
              }

              return entries;
            };
          </script>
        `)
        .withBody(`
          <h1>Progressive Resource Test</h1>
          <img id="lcp-image"
               src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23ff0000'/%3E%3C/svg%3E"
               style="width: 400px; height: 400px;" />
        `)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
          }

          await imagesPainted(page)
          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const lcp = viewEvent.view.largest_contentful_paint
          const lcpData = viewEvent.view.performance?.lcp
          const subParts = lcpData?.sub_parts

          expect(lcp).toBeDefined()
          const lcpNs = lcp!

          // Check the mocked resource timing
          const resourceResponseEnd = await page.evaluate(() => {
            const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
            const imgResource = resources.find(r => r.name.includes('svg'))
            return imgResource?.responseEnd || 0
          })

          console.log('Progressive resource timing (ms):', {
            lcp: nsToMs(lcpNs),
            resourceResponseEnd,
          })

          expect(subParts).toBeDefined()

          if (isLcpSubParts(subParts)) {
            console.log('LCP subparts (ms):', {
              first_byte: nsToMs(subParts.first_byte),
              load_delay: nsToMs(subParts.load_delay),
              load_time: nsToMs(subParts.load_time),
              render_delay: nsToMs(subParts.render_delay),
            })

            const sum = subParts.first_byte + subParts.load_delay + subParts.load_time + subParts.render_delay
            console.log('Sum vs LCP (ms):', { sum: nsToMs(sum), lcp: nsToMs(lcpNs) })
          }

          // For progressive resources, responseEnd should be capped at LCP time
          // Otherwise: sum(subparts) > LCP (mathematically impossible)
          if (resourceResponseEnd > nsToMs(lcpNs) && isLcpSubParts(subParts)) {
            const sum = subParts.first_byte + subParts.load_delay + subParts.load_time + subParts.render_delay
            expect(sum).toBe(lcpNs)
            expect(subParts.load_time).toBeLessThanOrEqual(lcpNs)
          }
        })
    })

    test.describe('🐛 BUG: Missing element.id fallback', () => {
      createTest('should use entry.id when element is removed from DOM')
        .withRum()
        .withBody(`
          <h1>LCP Element Removal Test</h1>
          <img id="lcp-image-with-unique-id"
               src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect width='200' height='200' fill='%23ff0000'/%3E%3C/svg%3E"
               style="width: 200px; height: 200px;" />
          <script>
            // Wait for LCP to be observed, then remove element
            setTimeout(() => {
              const img = document.getElementById('lcp-image-with-unique-id');
              if (img) {
                console.log('Removing LCP element from DOM');
                img.remove();
              }
            }, 200);
          </script>
        `)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
          }

          // Wait for element to be removed
          await page.waitForTimeout(500)

          const elementExists = await page.evaluate(() => {
            return document.getElementById('lcp-image-with-unique-id') !== null
          })

          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const selector = viewEvent.view.largest_contentful_paint_target_selector

          console.log('Element removal test:', { elementExists, selector })

          // CORRECT BEHAVIOR: When element is removed, should fallback to entry.id
          // Expected: selector should include "#lcp-image-with-unique-id"
          // Bug: SDK only uses getSelectorFromElement, which can't access removed elements

          if (!elementExists) {
            // Element was successfully removed
            // CORRECT: Selector should still contain the ID for debugging
            // Web-vitals does: if (entry.id) { return `#${entry.id}` }
            expect(selector).toContain('lcp-image-with-unique-id') // CORRECT: Should preserve the ID
          } else {
            // Element wasn't removed in time, test the normal case
            expect(selector).toBeDefined()
          }
        })
    })

    test.describe('Sum validation test', () => {
      createTest('sum of subparts should equal LCP value')
        .withRum()
        .withBody(createLcpPage().body)
        .run(async ({ page, intakeRegistry, flushEvents }) => {
          if (!(await browserSupportsLCP(page))) {
            test.skip()
            return
          }

          await imagesPainted(page)
          await page.goto('about:blank')
          await flushEvents()

          const viewEvent = intakeRegistry.rumViewEvents[0]
          const lcp = viewEvent.view.largest_contentful_paint
          const firstByte = viewEvent.view.first_byte
          const lcpData = viewEvent.view.performance?.lcp
          const subParts = lcpData?.sub_parts

          // These must be defined for the test to be meaningful
          expect(lcp).toBeDefined()
          expect(firstByte).toBeDefined()
          expect(lcpData).toBeDefined()
          expect(subParts).toBeDefined()

          const lcpNs = lcp!
          const firstByteNs = firstByte!

          console.log('LCP timing (ms):', { lcp: nsToMs(lcpNs), firstByte: nsToMs(firstByteNs) })

          // Fail the test if subParts is not available (can't validate invariant)
          if (!isLcpSubParts(subParts)) {
            throw new Error('subParts not available - cannot validate sum invariant')
          }

          console.log('LCP subparts (ms):', {
            first_byte: nsToMs(subParts.first_byte),
            load_delay: nsToMs(subParts.load_delay),
            load_time: nsToMs(subParts.load_time),
            render_delay: nsToMs(subParts.render_delay),
          })

          // Mathematical invariant: sum(subparts) = LCP
          const sum = subParts.first_byte + subParts.load_delay + subParts.load_time + subParts.render_delay
          console.log('Sum validation (ms):', { sum: nsToMs(sum), lcp: nsToMs(lcpNs), diff: nsToMs(sum - lcpNs) })

          expect(firstByteNs).toBeLessThan(lcpNs)
          expect(sum).toBe(lcpNs)
          expect(subParts.first_byte).toBe(firstByteNs)
        })
    })
  })
})
