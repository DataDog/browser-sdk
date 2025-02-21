import type { ViewportResizeData, ScrollData } from '@datadog/browser-rum/cjs/types'
import { IncrementalSource } from '@datadog/browser-rum/cjs/types'

import { findAllIncrementalSnapshots, findAllVisualViewports } from '@datadog/browser-rum/test/segments'
import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { wait } from '@datadog/browser-core/test/wait'
import type { IntakeRegistry } from '../../lib/framework'
import { createTest, bundleSetup, html } from '../../lib/framework'

const NAVBAR_HEIGHT_CHANGE_UPPER_BOUND = 30
const VIEWPORT_META_TAGS = `
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=2.75, minimum-scale=1.0, user-scalable=yes"
>
`

function hasNoTouchGestureEmulationSupportViaCDP(browserName: string) {
  return [
    browserName !== 'chromium' && browserName !== 'msedge',
    'only chromium based browser supports touch gestures emulation for now (via CDP)',
  ] as const
}

test.describe('recorder', () => {
  test.describe('layout viewport properties', () => {
    createTest('getWindowWidth/Height should not be affected by pinch zoom')
      .withRum()
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ intakeRegistry, page, flushEvents, browserName }) => {
        test.fixme(browserName === 'msedge', 'In Edge, the ViewportResize record data is off by almost 20px')
        test.skip(...hasNoTouchGestureEmulationSupportViaCDP(browserName))

        await buildScrollablePage(page)

        const { innerWidth, innerHeight } = await getWindowInnerDimensions(page)

        await performSignificantZoom(page)

        await page.evaluate(() => {
          window.dispatchEvent(new Event('resize'))
        })

        await flushEvents()
        const lastViewportResizeData = getLastRecord(intakeRegistry, (segment) =>
          findAllIncrementalSnapshots(segment, IncrementalSource.ViewportResize)
        ).data as ViewportResizeData

        expectToBeNearby(lastViewportResizeData.width, innerWidth)
        expectToBeNearby(lastViewportResizeData.height, innerHeight)
      })

    /**
     * window.ScrollX/Y on some devices/browsers are changed by pinch zoom
     * We need to ensure that our measurements are not affected by pinch zoom
     */
    createTest('getScrollX/Y should not be affected by pinch scroll')
      .withRum()
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ intakeRegistry, flushEvents, page, browserName }) => {
        test.skip(...hasNoTouchGestureEmulationSupportViaCDP(browserName))

        const VISUAL_SCROLL_DOWN_PX = 60
        const LAYOUT_SCROLL_AMOUNT = 20

        await buildScrollablePage(page)
        await performSignificantZoom(page)
        await resetWindowScroll(page)

        const initialVisualViewport = await getVisualViewport(page)
        const { scrollX: initialScrollX, scrollY: initialScrollY } = await getWindowScroll(page)

        // Add Visual Viewport Scroll
        await visualScrollVerticallyDown(page, VISUAL_SCROLL_DOWN_PX)

        // Add Layout Viewport Scroll
        await layoutScrollTo(page, LAYOUT_SCROLL_AMOUNT, LAYOUT_SCROLL_AMOUNT)

        const nextVisualViewport = await getVisualViewport(page)
        const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll(page)

        await flushEvents()
        const lastScrollData = getLastRecord(intakeRegistry, (segment) =>
          findAllIncrementalSnapshots(segment, IncrementalSource.Scroll)
        ).data as ScrollData

        // Height changes because URL address bar changes due to scrolling
        const navBarHeightChange = nextVisualViewport.height - initialVisualViewport.height
        expect(navBarHeightChange).toBeLessThanOrEqual(NAVBAR_HEIGHT_CHANGE_UPPER_BOUND)

        // Visual Viewport Scroll should change without visual viewport affect
        expectToBeNearby(lastScrollData.x, initialScrollX + LAYOUT_SCROLL_AMOUNT)
        expectToBeNearby(lastScrollData.y, initialScrollY + LAYOUT_SCROLL_AMOUNT)
        expectToBeNearby(lastScrollData.x, nextScrollX)
        expectToBeNearby(lastScrollData.y, nextScrollY)
      })
  })

  test.describe('visual viewport properties', () => {
    createTest('pinch zoom "scroll" event reports visual viewport position')
      .withRum()
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ intakeRegistry, page, flushEvents, browserName }) => {
        test.skip(...hasNoTouchGestureEmulationSupportViaCDP(browserName))

        const VISUAL_SCROLL_DOWN_PX = 100
        await buildScrollablePage(page)
        await performSignificantZoom(page)
        await visualScrollVerticallyDown(page, VISUAL_SCROLL_DOWN_PX)
        const nextVisualViewportDimension = await getVisualViewport(page)
        await flushEvents()
        const lastVisualViewportRecord = getLastRecord(intakeRegistry, findAllVisualViewports)
        expectToBeNearby(lastVisualViewportRecord.data.pageTop, nextVisualViewportDimension.pageTop)
      })

    createTest('pinch zoom "resize" event reports visual viewport scale')
      .withRum()
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ intakeRegistry, page, flushEvents, browserName }) => {
        test.skip(...hasNoTouchGestureEmulationSupportViaCDP(browserName))

        await performSignificantZoom(page)
        const nextVisualViewportDimension = await getVisualViewport(page)
        await flushEvents()
        const lastVisualViewportRecord = getLastRecord(intakeRegistry, findAllVisualViewports)
        expectToBeNearby(lastVisualViewportRecord.data.scale, nextVisualViewportDimension.scale)
      })
  })
})

// Flakiness: Working with viewport sizes has variations per device of a few pixels
function expectToBeNearby(numA: number, numB: number) {
  const test = Math.abs(numA - numB) <= 5
  if (!test) {
    // Prints a clear error message when different
    expect(numA).toBe(numB)
  }
}

async function pinchZoom(page: Page, xChange: number) {
  // Cannot exceed the bounds of a device's screen, at start or end positions.
  // So pick a midpoint on small devices, roughly 180px.
  const xBase = 180
  const yBase = 180
  const xOffsetFingerTwo = 25
  const pauseDurationMs = 150

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: xBase, y: yBase, id: 0 },
      { x: xBase + xOffsetFingerTwo, y: yBase, id: 1 },
    ],
  })
  await page.waitForTimeout(pauseDurationMs)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: xBase, y: yBase, id: 0 },
      { x: xBase + xChange, y: yBase, id: 1 },
    ],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [
      { x: xBase, y: yBase, id: 0 },
      { x: xBase + xChange, y: yBase, id: 1 },
    ],
  })
}

async function performSignificantZoom(page: Page) {
  const initialVisualViewport = await getVisualViewport(page)
  await pinchZoom(page, 150)
  await pinchZoom(page, 150)
  const nextVisualViewport = await getVisualViewport(page)
  // Test the test: ensure pinch zoom was applied
  expect(nextVisualViewport.scale).toBeGreaterThan(initialVisualViewport.scale)
}

async function visualScrollVerticallyDown(page: Page, yChange: number) {
  // Providing a negative offset value will scroll up.
  // NOTE: Some devices may invert scroll direction
  // Cannot exceed the bounds of a device's screen, at start or end positions.
  // So pick a midpoint on small devices, roughly 180px.
  const xBase = 180
  const yBase = 180
  // Scrolling too fast can show or hide the address bar on some device browsers.
  const pauseDurationMs = 150

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: xBase, y: yBase, id: 0 }],
  })
  await wait(pauseDurationMs)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: xBase, y: yBase - yChange, id: 0 }],
  })
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ x: xBase, y: yBase - yChange, id: 0 }],
  })
}

async function buildScrollablePage(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty('width', '5000px')
    document.documentElement.style.setProperty('height', '5000px')
    document.documentElement.style.setProperty('margin', '0px')
    document.documentElement.style.setProperty('padding', '0px')
    document.body.style.setProperty('margin', '0px')
    document.body.style.setProperty('padding', '0px')
    document.body.style.setProperty('width', '5000px')
    document.body.style.setProperty('height', '5000px')
  })
}

interface VisualViewportData {
  scale: number
  width: number
  height: number
  offsetLeft: number
  offsetTop: number
  pageLeft: number
  pageTop: number
}

function getVisualViewport(page: Page): Promise<VisualViewportData> {
  return page.evaluate(() => {
    const visual = window.visualViewport || ({} as Record<string, undefined>)
    return {
      scale: visual.scale,
      width: visual.width,
      height: visual.height,
      offsetLeft: visual.offsetLeft,
      offsetTop: visual.offsetTop,
      pageLeft: visual.pageLeft,
      pageTop: visual.pageTop,
    }
  }) as Promise<VisualViewportData>
}

function getWindowScroll(page: Page) {
  return page.evaluate(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  })) as Promise<{ scrollX: number; scrollY: number }>
}

function getLastRecord<T>(intakeRegistry: IntakeRegistry, filterMethod: (segment: any) => T[]): T {
  const segment = intakeRegistry.replaySegments.at(-1)
  const foundRecords = filterMethod(segment)
  return foundRecords[foundRecords.length - 1]
}

function getWindowInnerDimensions(page: Page) {
  return page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  })) as Promise<{ innerWidth: number; innerHeight: number }>
}

async function resetWindowScroll(page: Page) {
  await page.evaluate(() => {
    window.scrollTo(-500, -500)
  })
  const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll(page)
  // Ensure our methods are applied correctly
  expect(nextScrollX).toBe(0)
  expect(nextScrollY).toBe(0)
}

async function layoutScrollTo(page: Page, scrollX: number, scrollY: number) {
  await page.evaluate(
    ({ scrollX, scrollY }) => {
      window.scrollTo(scrollX, scrollY)
    },
    { scrollX, scrollY }
  )
  const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll(page)
  // Ensure our methods are applied correctly
  expect(scrollX).toBe(nextScrollX)
  expect(scrollY).toBe(nextScrollY)
}
