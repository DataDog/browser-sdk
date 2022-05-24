import type { ViewportResizeData, ScrollData } from '@datadog/browser-rum/cjs/types'
import { IncrementalSource } from '@datadog/browser-rum/cjs/types'
import type { RumInitConfiguration } from '@datadog/browser-rum-core'

import { findAllIncrementalSnapshots, findAllVisualViewports } from '@datadog/browser-rum/test/utils'
import type { EventRegistry } from '../../lib/framework'
import { flushEvents, createTest, bundleSetup, html } from '../../lib/framework'
import { browserExecute, getBrowserName, getPlatformName } from '../../lib/helpers/browser'

const NAVBAR_HEIGHT_CHANGE_UPPER_BOUND = 30
const VIEWPORT_META_TAGS = `
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=2.75, minimum-scale=1.0, user-scalable=yes"
>
`

describe('recorder', () => {
  beforeEach(() => {
    if (isGestureUnsupported()) {
      pending('no touch gesture support')
    }
  })

  describe('layout viewport properties', () => {
    createTest('getWindowWidth/Height should not be affected by pinch zoom')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ serverEvents }) => {
        await buildScrollablePage()

        const { innerWidth, innerHeight } = await getWindowInnerDimensions()
        await performSignificantZoom()

        await browserExecute(() => {
          window.dispatchEvent(new Event('resize'))
        })

        const lastViewportResizeData = (
          await getLastRecord(serverEvents, (segment) =>
            findAllIncrementalSnapshots(segment, IncrementalSource.ViewportResize)
          )
        ).data as ViewportResizeData

        const scrollbarThicknessCorrection = await getScrollbarThicknessCorrection()

        expectToBeNearby(lastViewportResizeData.width, innerWidth - scrollbarThicknessCorrection)
        expectToBeNearby(lastViewportResizeData.height, innerHeight - scrollbarThicknessCorrection)
      })

    /**
     * window.ScrollX/Y on some devices/browsers are changed by pinch zoom
     * We need to ensure that our measurements are not affected by pinch zoom
     */
    createTest('getScrollX/Y should not be affected by pinch scroll')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ serverEvents }) => {
        const VISUAL_SCROLL_DOWN_PX = 60
        const LAYOUT_SCROLL_AMOUNT = 20

        await buildScrollablePage()
        await performSignificantZoom()
        await resetWindowScroll()

        const initialVisualViewport = await getVisualViewport()
        const { scrollX: initialScrollX, scrollY: initialScrollY } = await getWindowScroll()

        // Add Visual Viewport Scroll
        await visualScrollVerticallyDown(VISUAL_SCROLL_DOWN_PX)

        // Add Layout Viewport Scroll
        await layoutScrollTo(LAYOUT_SCROLL_AMOUNT, LAYOUT_SCROLL_AMOUNT)

        const nextVisualViewport = await getVisualViewport()
        const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll()

        const lastScrollData = (
          await getLastRecord(serverEvents, (segment) => findAllIncrementalSnapshots(segment, IncrementalSource.Scroll))
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

  describe('visual viewport properties', () => {
    createTest('pinch zoom "scroll" event reports visual viewport position')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ serverEvents }) => {
        const VISUAL_SCROLL_DOWN_PX = 100
        await buildScrollablePage()
        await performSignificantZoom()
        await visualScrollVerticallyDown(VISUAL_SCROLL_DOWN_PX)
        const nextVisualViewportDimension = await getVisualViewport()
        const lastVisualViewportRecord = await getLastRecord(serverEvents, findAllVisualViewports)
        expectToBeNearby(lastVisualViewportRecord.data.pageTop, nextVisualViewportDimension.pageTop)
      })

    createTest('pinch zoom "resize" event reports visual viewport scale')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ serverEvents }) => {
        await performSignificantZoom()
        const nextVisualViewportDimension = await getVisualViewport()
        const lastVisualViewportRecord = await getLastRecord(serverEvents, findAllVisualViewports)
        expectToBeNearby(lastVisualViewportRecord.data.scale, nextVisualViewportDimension.scale)
      })
  })
})

function getLastSegment(serverEvents: EventRegistry) {
  return serverEvents.sessionReplay[serverEvents.sessionReplay.length - 1].segment.data
}

function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}

const isGestureUnsupported = () =>
  /firefox|safari|edge/.test(getBrowserName()) || /windows|linux/.test(getPlatformName())

// Flakiness: Working with viewport sizes has variations per device of a few pixels
function expectToBeNearby(numA: number, numB: number) {
  const test = Math.abs(numA - numB) <= 5
  if (!test) {
    // Prints a clear error message when different
    expect(numA).toBe(numB)
  }
}

async function pinchZoom(xChange: number) {
  // Cannot exceed the bounds of a device's screen, at start or end positions.
  // So pick a midpoint on small devices, roughly 180px.
  const xBase = 180
  const yBase = 180
  const xOffsetFingerTwo = 25
  // Scrolling too fast can show or hide the address bar on some device browsers.
  const moveDurationMs = 400
  const pauseDurationMs = 150
  const actions = [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: xBase, y: yBase },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: pauseDurationMs },
        { type: 'pointerMove', duration: moveDurationMs, origin: 'pointer', x: -xChange, y: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
    {
      type: 'pointer',
      id: 'finger2',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: xBase + xOffsetFingerTwo, y: yBase },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: pauseDurationMs },
        { type: 'pointerMove', duration: moveDurationMs, origin: 'pointer', x: +xChange, y: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]
  await driver.performActions(actions)
}

async function performSignificantZoom() {
  const initialVisualViewport = await getVisualViewport()
  await pinchZoom(150)
  await pinchZoom(150)
  const nextVisualViewport = await getVisualViewport()
  // Test the test: ensure pinch zoom was applied
  expect(initialVisualViewport.scale < nextVisualViewport.scale).toBeTruthy()
}

async function visualScrollVerticallyDown(yChange: number) {
  // Providing a negative offset value will scroll up.
  // NOTE: Some devices may invert scroll direction
  // Cannot exceed the bounds of a device's screen, at start or end positions.
  // So pick a midpoint on small devices, roughly 180px.
  const xBase = 180
  const yBase = 180
  // Scrolling too fast can show or hide the address bar on some device browsers.
  const moveDurationMs = 800
  const pauseDurationMs = 150

  const actions = [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: xBase, y: yBase },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: pauseDurationMs },
        { type: 'pointerMove', duration: moveDurationMs, origin: 'pointer', x: 0, y: -yChange },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]
  await driver.performActions(actions)
}

async function buildScrollablePage() {
  await browserExecute(() => {
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

function getVisualViewport(): Promise<VisualViewportData> {
  return browserExecute(() => {
    const visual = window.visualViewport || {}
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

function getWindowScroll() {
  return browserExecute(() => ({
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  })) as Promise<{ scrollX: number; scrollY: number }>
}

function getScrollbarThickness(): Promise<number> {
  // https://stackoverflow.com/questions/13382516/getting-scroll-bar-width-using-javascript#answer-13382873
  return browserExecute(() => {
    // Creating invisible container
    const outer = document.createElement('div')
    outer.style.visibility = 'hidden'
    outer.style.overflow = 'scroll' // forcing scrollbar to appear
    ;(outer.style as any).msOverflowStyle = 'scrollbar' // needed for WinJS apps
    document.body.appendChild(outer)
    // Creating inner element and placing it in the container
    const inner = document.createElement('div')
    outer.appendChild(inner)
    // Calculating difference between container's full width and the child width
    const scrollbarThickness = outer.offsetWidth - inner.offsetWidth
    // Removing temporary elements from the DOM
    document.body.removeChild(outer)
    return scrollbarThickness
  }) as Promise<number>
}

// Mac OS X Chrome scrollbars are included here (~15px) which seems to be against spec
// Scrollbar edge-case handling not considered right now, further investigation needed
async function getScrollbarThicknessCorrection(): Promise<number> {
  let scrollbarThickness = 0
  if (getBrowserName() === 'chrome' && getPlatformName() === 'macos') {
    scrollbarThickness = await getScrollbarThickness()
  }
  return scrollbarThickness
}

async function getLastRecord<T>(serverEvents: EventRegistry, filterMethod: (segment: any) => T[]): Promise<T> {
  await flushEvents()
  const segment = getLastSegment(serverEvents)
  const foundRecords = filterMethod(segment)
  return foundRecords[foundRecords.length - 1]
}

function getWindowInnerDimensions() {
  return browserExecute(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  })) as Promise<{ innerWidth: number; innerHeight: number }>
}

async function resetWindowScroll() {
  await browserExecute(() => {
    window.scrollTo(-500, -500)
  })
  const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll()
  // Ensure our methods are applied correctly
  expect(nextScrollX).toBe(0)
  expect(nextScrollY).toBe(0)
}

async function layoutScrollTo(scrollX: number, scrollY: number) {
  await browser.execute(
    (x, y) => {
      window.scrollTo(x, y)
    },
    scrollX,
    scrollY
  )
  const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll()
  // Ensure our methods are applied correctly
  expect(scrollX).toBe(nextScrollX)
  expect(scrollY).toBe(nextScrollY)
}
