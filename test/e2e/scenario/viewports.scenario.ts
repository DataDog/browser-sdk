import { IncrementalSource, ViewportResizeData, ScrollData } from '@datadog/browser-rum/cjs/types'
import { RumInitConfiguration } from '@datadog/browser-rum-core'

import { findAllIncrementalSnapshots, findAllVisualViewports } from '../../../packages/rum/test/utils'
import { createTest, bundleSetup, html, EventRegistry } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'

const VIEWPORT_META_TAGS = `
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=2.75, minimum-scale=1.0, user-scalable=yes"
>
`

describe('recorder', () => {
  describe('layout viewport properties', () => {
    /**
     * InnerWidth/Height on some devices/browsers are changed by pinch zoom.
     * Read vendor discussions around the challenges of standardization:
     * - https://bugs.chromium.org/p/chromium/issues/detail?id=489206
     *
     * The purpose of this test is to check that browser dimensions are measuring the
     * layout viewport (not visual viewport), and so they do not change when pinch zoom is applied.
     */
    createTest('getWindowWidth/Height should not be affected by pinch zoom')
      .withRum({ enableExperimentalFeatures: ['visualviewport'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ events }) => {
        if (isGestureUnsupported()) {
          return // No Fallback test
        }
        await resetViewport()

        const { innerWidth, innerHeight } = await getInnerDimentions()
        const initialVisualViewport = await getVisualViewport()
        await performSignificantZoom()
        const nextVisualViewport = await getVisualViewport()

        await browserExecute(() => {
          window.dispatchEvent(new Event('resize'))
        })
        await browser.pause(210)

        const lastViewportResizeRecord = ((await getLastRecord(events, (segment) =>
          findAllIncrementalSnapshots(segment, IncrementalSource.ViewportResize)
        )) as unknown) as ViewportResizeData

        // Mac OS X Chrome scrollbars are included here (~15px) which seems to be against spec
        // Scrollbar edge-case handling not considered right now, further investigation needed
        const scrollbarWidth = await getScrollbarCorrection()

        expectToBeNearby(lastViewportResizeRecord.width, innerWidth - scrollbarWidth)
        expectToBeNearby(lastViewportResizeRecord.height, innerHeight - scrollbarWidth)

        // Test the test: ensure the pinch zoom worked
        expect(initialVisualViewport.scale < nextVisualViewport.scale).toBeTruthy()
      })

    /**
     * window.ScrollX/Y on some devices/browsers are changed by pinch zoom
     * We need to ensure that our measurements are not affected by pinch zoom
     */
    createTest('scrollX/Y should not be affected by pinch scroll')
      .withRum({ enableExperimentalFeatures: ['visualviewport'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ events }) => {
        const SCROLL_DOWN_PX = 60

        if (isGestureUnsupported()) {
          return // No Fallback test
        }
        await resetViewport()

        await browserExecute(() => {
          window.scrollTo(-500, -500)
        })
        await performSignificantZoom()
        await browserExecute(() => {
          window.scrollTo(-500, -500)
        })

        const { scrollX: baseScrollX, scrollY: baseScrollY } = await getWindowScroll()
        const preVisualViewport = await getVisualViewport()

        // NOTE: Due to scrolling down, the hight of the page changed.
        // Given time constraints, this should be a follow up once more experience is gained via data collection
        await pinchScrollVerticallyDown(SCROLL_DOWN_PX) // Scroll Down on Android
        await browser.pause(210)

        const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll()
        const nextVisualViewport = await getVisualViewport()

        await browserExecute(() => {
          document.dispatchEvent(new Event('scroll'))
        })
        await browser.pause(210)

        const lastScrollRecord = await getLastRecord(
          events,
          (segment) => (findAllIncrementalSnapshots(segment, IncrementalSource.Scroll) as unknown) as ScrollData[]
        )

        // Layout Viewport should not change
        expect(baseScrollX).toBe(0)
        expect(baseScrollY).toBe(0)
        expect(nextScrollX).toBe(0)
        expect(nextScrollY).toBe(0)

        // Height changes because URL address bar changes due to scrolling
        const heightChange = nextVisualViewport.height - preVisualViewport.height
        expect(heightChange).toBeLessThanOrEqual(30)

        // Test the test: Visual Viewport (pinch scroll) should change
        expectToBeNearby(nextVisualViewport.pageLeft, preVisualViewport.pageLeft)
        expectToBeNearby(nextVisualViewport.offsetLeft, preVisualViewport.offsetLeft)

        // REMINDER: Isolating address bar height via `heightChange` param
        expectToBeNearby(nextVisualViewport.pageTop, preVisualViewport.pageTop + SCROLL_DOWN_PX - heightChange)
        expectToBeNearby(nextVisualViewport.offsetTop, preVisualViewport.offsetTop + SCROLL_DOWN_PX - heightChange)

        expectToBeNearby(lastScrollRecord.x, nextVisualViewport.pageLeft)
        expectToBeNearby(lastScrollRecord.y, nextVisualViewport.pageTop)
      })
  })

  describe('visual viewport properties', () => {
    createTest('pinch "scroll" event reports visual viewport page offsets')
      .withRum({ enableExperimentalFeatures: ['visualviewport'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ events }) => {
        const SCROLL_DOWN_PX = 100

        if (isGestureUnsupported()) {
          return // No Fallback test possible
        }
        await resetViewport()

        await performSignificantZoom()
        const middleVisualViewportDimension = await getVisualViewport()
        await pinchScrollVerticallyDown(SCROLL_DOWN_PX) // Trigger a resize event
        const nextVisualViewportDimension = await getVisualViewport()

        const lastVisualViewportRecord = await getLastRecord(events, findAllVisualViewports)

        // Height changes because URL address bar changes due to scrolling
        const heightChange = nextVisualViewportDimension.height - middleVisualViewportDimension.height
        expect(heightChange).toBeLessThanOrEqual(30)

        expectToBeNearby(lastVisualViewportRecord.data.scale, nextVisualViewportDimension.scale)
        expectToBeNearby(lastVisualViewportRecord.data.width, nextVisualViewportDimension.width)
        expectToBeNearby(lastVisualViewportRecord.data.height, nextVisualViewportDimension.height)

        expect(lastVisualViewportRecord.data.offsetLeft).toBeGreaterThanOrEqual(0)
        expect(lastVisualViewportRecord.data.offsetTop).toBeGreaterThanOrEqual(0)
        expect(lastVisualViewportRecord.data.pageLeft).toBeGreaterThanOrEqual(0)
        expect(lastVisualViewportRecord.data.pageTop).toBeGreaterThanOrEqual(0)

        // Increase by scroll amount, excluding any height change due to address bar appearing or disappearing.
        expectToBeNearby(
          lastVisualViewportRecord.data.pageTop,
          middleVisualViewportDimension.offsetTop + SCROLL_DOWN_PX - heightChange
        )
        expectToBeNearby(
          lastVisualViewportRecord.data.offsetTop,
          middleVisualViewportDimension.offsetTop + SCROLL_DOWN_PX - heightChange
        )
      })

    createTest('pinch zoom "resize" event reports visual viewport scale and dimension')
      .withRum({ enableExperimentalFeatures: ['visualviewport'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ events }) => {
        if (isGestureUnsupported()) {
          return // No Fallback test possible
        }

        await resetViewport()
        const initialVisualViewportDimension = await getVisualViewport()
        await performSignificantZoom()
        const nextVisualViewportDimension = await getVisualViewport()

        const lastVisualViewportRecord = await getLastRecord(events, findAllVisualViewports)

        // SDK returns Visual Viewport object
        expectToBeNearby(lastVisualViewportRecord.data.scale, nextVisualViewportDimension.scale)
        expectToBeNearby(lastVisualViewportRecord.data.width, nextVisualViewportDimension.width)
        expectToBeNearby(lastVisualViewportRecord.data.height, nextVisualViewportDimension.height)
        expectToBeNearby(lastVisualViewportRecord.data.offsetLeft, nextVisualViewportDimension.offsetLeft)
        expectToBeNearby(lastVisualViewportRecord.data.offsetTop, nextVisualViewportDimension.offsetTop)
        expectToBeNearby(lastVisualViewportRecord.data.pageLeft, nextVisualViewportDimension.pageLeft)
        expectToBeNearby(lastVisualViewportRecord.data.pageTop, nextVisualViewportDimension.pageTop)

        // With correct transformation
        const finalScaleAmount = nextVisualViewportDimension.scale
        expectToBeNearby(lastVisualViewportRecord.data.scale, finalScaleAmount)
        expectToBeNearby(lastVisualViewportRecord.data.width, initialVisualViewportDimension.width / finalScaleAmount)
        expectToBeNearby(lastVisualViewportRecord.data.height, initialVisualViewportDimension.height / finalScaleAmount)

        expect(lastVisualViewportRecord.data.offsetLeft).toBeGreaterThan(0)
        expect(lastVisualViewportRecord.data.offsetTop).toBeGreaterThan(0)
        expect(lastVisualViewportRecord.data.pageLeft).toBeGreaterThan(0)
        expect(lastVisualViewportRecord.data.pageTop).toBeGreaterThan(0)
      })
  })
})

function getLastSegment(events: EventRegistry) {
  return events.sessionReplay[events.sessionReplay.length - 1].segment.data
}

export function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}

const isGestureUnsupported = () => {
  const { capabilities } = browser
  return (
    capabilities.browserName === 'firefox' ||
    capabilities.browserName === 'Safari' ||
    capabilities.browserName === 'msedge' ||
    capabilities.platformName === 'windows' ||
    capabilities.platformName === 'linux'
  )
}

// Flakiness: Working with viewport sizes has variations per device of a few pixels
function expectToBeNearby(numA: number, numB: number) {
  const roundedA = Math.round(numA)
  const roundedB = Math.round(numB)
  const test = Math.abs(roundedA - roundedB) <= 5
  if (test) {
    expect(test).toBeTruthy()
  } else {
    // Prints a clear error message when different
    expect(roundedB).toBe(roundedA)
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
  await browser.pause(50)
}

async function performSignificantZoom() {
  await browser.pause(50)
  await pinchZoom(150)
  await pinchZoom(150)
  await browser.pause(210)
}

// Providing a negative offset value will scroll up.
// NOTE: Some devices may invert scroll direction
async function pinchScrollVerticallyDown(yChange: number) {
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
  await browser.pause(210)
}

async function resetViewport() {
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
  await browser.pause(50)
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

async function getScrollbarWidth(): Promise<number> {
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
    const scrollbarWidth = outer.offsetWidth - inner.offsetWidth

    // Removing temporary elements from the DOM
    document.body.removeChild(outer)

    return scrollbarWidth
  }) as Promise<number>
}

// Mac OS X Chrome scrollbars are included here (~15px) which seems to be against spec
// Scrollbar edge-case handling not considered right now, further investigation needed
async function getScrollbarCorrection(): Promise<number> {
  let scrollbarWidth = 0
  if (browser.capabilities.browserName === 'chrome' && browser.capabilities.platformName === 'mac os x') {
    scrollbarWidth = await getScrollbarWidth()
  }
  return scrollbarWidth
}

async function getLastRecord<T>(events: EventRegistry, filterMethod: (segment: any) => T[]): Promise<T> {
  await flushEvents()
  const segment = getLastSegment(events)
  const foundRecords = filterMethod(segment)
  const lastRecord = foundRecords[foundRecords.length - 1]
  return lastRecord
}

async function getInnerDimentions() {
  return browserExecute(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  })) as Promise<{ innerWidth: number; innerHeight: number }>
}
