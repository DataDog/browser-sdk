import {
  CreationReason,
  IncrementalSource,
  RecordType,
  Segment,
  ViewportResizeData,
  ScrollData,
} from '@datadog/browser-rum/cjs/types'
import { InputData, StyleSheetRuleData, NodeType } from '@datadog/browser-rum/cjs/domain/record/types'
import { RumInitConfiguration } from '@datadog/browser-rum-core'
import { DefaultPrivacyLevel } from '@datadog/browser-rum'

import { createTest, bundleSetup, html, EventRegistry } from '../lib/framework'
import { browserExecute, getVisualViewport, getWindowScroll } from '../lib/helpers/browser'
import { flushEvents, renewSession } from '../lib/helpers/sdk'
import {
  findElement,
  findElementWithIdAttribute,
  findFullSnapshot,
  findIncrementalSnapshot,
  findAllIncrementalSnapshots,
  findAllVisualViewport,
  findMeta,
  findTextContent,
  createMutationPayloadValidatorFromSegment,
} from '../../../packages/rum/test/utils'

const INTEGER_RE = /^\d+$/
const TIMESTAMP_RE = /^\d{13}$/
const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/

const VIEWPORT_META_TAGS = `
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=2.75, minimum-scale=1.0, user-scalable=yes"
>
`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isGestureUnsupported = () => {
  const { capabilities } = browser
  return !!(
    capabilities.browserName === 'firefox' ||
    capabilities.browserName === 'Safari' ||
    capabilities.browserName === 'msedge' ||
    capabilities.platformName === 'windows' ||
    capabilities.platformName === 'linux'
  )
}

// Flakiness: Working with viewport sizes has variations per device of a few pixels
function expectToBeNearby(numA: number, numB: number) {
  const test = Math.abs(numA - numB) < 5
  if (test) {
    expect(test).toBeTruthy()
  } else {
    // Prints a clear error message
    expect(numB).toBe(numA)
  }
}

describe('recorder', () => {
  createTest('record mouse move')
    .withRum()
    .withRumInit(initRumAndStartRecording)
    .run(async ({ events }) => {
      await browserExecute(() => document.documentElement.outerHTML)
      const html = await $('html')
      await html.click()
      await flushEvents()

      expect(events.sessionReplay.length).toBe(1)
      const { segment, meta } = events.sessionReplay[0]
      expect(meta).toEqual({
        'application.id': jasmine.stringMatching(UUID_RE),
        creation_reason: 'init',
        end: jasmine.stringMatching(TIMESTAMP_RE),
        has_full_snapshot: 'true',
        records_count: jasmine.stringMatching(INTEGER_RE),
        'session.id': jasmine.stringMatching(UUID_RE),
        start: jasmine.stringMatching(TIMESTAMP_RE),
        'view.id': jasmine.stringMatching(UUID_RE),
        raw_segment_size: jasmine.stringMatching(INTEGER_RE),
      })
      expect(segment).toEqual({
        data: {
          application: { id: meta['application.id'] },
          creation_reason: meta.creation_reason as CreationReason,
          end: Number(meta.end),
          has_full_snapshot: true,
          records: jasmine.any(Array),
          records_count: Number(meta.records_count),
          session: { id: meta['session.id'] },
          start: Number(meta.start),
          view: { id: meta['view.id'] },
        },
        encoding: jasmine.any(String),
        filename: `${meta['session.id']}-${meta.start}`,
        mimetype: 'application/octet-stream',
      })
      expect(findMeta(segment.data)).toBeTruthy('have a Meta record')
      expect(findFullSnapshot(segment.data)).toBeTruthy('have a FullSnapshot record')
      expect(findIncrementalSnapshot(segment.data, IncrementalSource.MouseInteraction)).toBeTruthy(
        'have a IncrementalSnapshot/MouseInteraction record'
      )
    })

  describe('full snapshot', () => {
    createTest('obfuscate elements')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <div id="not-obfuscated">foo</div>
          <p id="hidden-by-attribute" data-dd-privacy="hidden">bar</p>
          <span id="hidden-by-classname" class="dd-privacy-hidden baz">baz</span>
          <input id="input-ignored" data-dd-privacy="input-ignored" value="toto" />
          <input id="input-masked" data-dd-privacy="input-masked" value="toto" />
        `
      )
      .run(async ({ events }) => {
        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const fullSnapshot = findFullSnapshot(getFirstSegment(events))!

        const node = findElementWithIdAttribute(fullSnapshot.data.node, 'not-obfuscated')
        expect(node).toBeTruthy()
        expect(findTextContent(node!)).toBe('foo')

        const hiddenNodeByAttribute = findElement(fullSnapshot.data.node, (node) => node.tagName === 'p')
        expect(hiddenNodeByAttribute).toBeTruthy()
        expect(hiddenNodeByAttribute!.attributes['data-dd-privacy']).toBe('hidden')
        expect(hiddenNodeByAttribute!.childNodes.length).toBe(0)

        const hiddenNodeByClassName = findElement(fullSnapshot.data.node, (node) => node.tagName === 'span')

        expect(hiddenNodeByClassName).toBeTruthy()
        expect(hiddenNodeByClassName!.attributes.class).toBeUndefined()
        expect(hiddenNodeByClassName!.attributes['data-dd-privacy']).toBe('hidden')
        expect(hiddenNodeByClassName!.childNodes.length).toBe(0)

        const inputIgnored = findElementWithIdAttribute(fullSnapshot.data.node, 'input-ignored')
        expect(inputIgnored).toBeTruthy()
        expect(inputIgnored!.attributes.value).toBe('***')

        const inputMasked = findElementWithIdAttribute(fullSnapshot.data.node, 'input-masked')
        expect(inputMasked).toBeTruthy()
        expect(inputMasked!.attributes.value).toBe('***')
      })
  })

  describe('mutations observer', () => {
    createTest('record mutations')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <p>mutation observer</p>
          <ul>
            <li></li>
          </ul>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          const li = document.createElement('li')
          const ul = document.querySelector('ul') as HTMLUListElement

          // Make sure mutations occurring in a removed element are not reported
          ul.appendChild(li)
          document.body.removeChild(ul)

          const p = document.querySelector('p') as HTMLParagraphElement
          p.appendChild(document.createElement('span'))
        })

        await flushEvents()

        const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidatorFromSegment(
          getFirstSegment(events)
        )

        validate({
          adds: [
            {
              parent: expectInitialNode({ tag: 'p' }),
              node: expectNewNode({ type: NodeType.Element, tagName: 'span' }),
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: expectInitialNode({ tag: 'ul' }),
            },
          ],
        })
      })

    createTest('record character data mutations')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <p>mutation observer</p>
          <ul>
            <li></li>
          </ul>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          const li = document.createElement('li')
          const ul = document.querySelector('ul') as HTMLUListElement

          // Make sure mutations occurring in a removed element are not reported
          ul.appendChild(li)
          li.innerText = 'new list item'
          li.innerText = 'new list item edit'
          document.body.removeChild(ul)

          const p = document.querySelector('p') as HTMLParagraphElement
          p.innerText = 'mutated'
        })

        await flushEvents()

        const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidatorFromSegment(
          getFirstSegment(events)
        )

        validate({
          adds: [
            {
              parent: expectInitialNode({ tag: 'p' }),
              node: expectNewNode({ type: NodeType.Text, textContent: 'mutated' }),
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: expectInitialNode({ tag: 'ul' }),
            },
            {
              parent: expectInitialNode({ tag: 'p' }),
              node: expectInitialNode({ text: 'mutation observer' }),
            },
          ],
        })
      })

    createTest('record attributes mutations')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <p>mutation observer</p>
          <ul>
            <li></li>
          </ul>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          const li = document.createElement('li')
          const ul = document.querySelector('ul') as HTMLUListElement

          // Make sure mutations occurring in a removed element are not reported
          ul.appendChild(li)
          li.setAttribute('foo', 'bar')
          document.body.removeChild(ul)

          document.body.setAttribute('test', 'true')
        })

        await flushEvents()

        const { validate, expectInitialNode } = createMutationPayloadValidatorFromSegment(getFirstSegment(events))

        validate({
          attributes: [
            {
              node: expectInitialNode({ tag: 'body' }),
              attributes: { test: 'true' },
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: expectInitialNode({ tag: 'ul' }),
            },
          ],
        })
      })

    createTest("don't record hidden elements mutations")
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <div data-dd-privacy="hidden">
            <ul>
              <li></li>
            </ul>
          </div>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          document.querySelector('div')!.setAttribute('foo', 'bar')
          document.querySelector('li')!.textContent = 'hop'
          document.querySelector('div')!.appendChild(document.createElement('p'))
        })

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)
        const segment = getFirstSegment(events)

        expect(findAllIncrementalSnapshots(segment, IncrementalSource.Mutation)).toEqual([])
      })

    createTest('record DOM node movement 1')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        // prettier-ignore
        html`
          <div>a<p></p>b</div>
          <span>c<i>d<b>e</b>f</i>g</span>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          const div = document.querySelector('div')!
          const p = document.querySelector('p')!
          const span = document.querySelector('span')!
          document.body.removeChild(span)
          p.appendChild(span)
          p.removeChild(span)
          div.appendChild(span)
        })

        await flushEvents()

        const { validate, expectInitialNode } = createMutationPayloadValidatorFromSegment(getFirstSegment(events))
        validate({
          adds: [
            {
              parent: expectInitialNode({ tag: 'div' }),
              node: expectInitialNode({ tag: 'span' }).withChildren(
                expectInitialNode({ text: 'c' }),
                expectInitialNode({ tag: 'i' }).withChildren(
                  expectInitialNode({ text: 'd' }),
                  expectInitialNode({ tag: 'b' }).withChildren(expectInitialNode({ text: 'e' })),
                  expectInitialNode({ text: 'f' })
                ),
                expectInitialNode({ text: 'g' })
              ),
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: expectInitialNode({ tag: 'span' }),
            },
          ],
        })
      })

    createTest('record DOM node movement 2')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        // prettier-ignore
        html`
          <span>c<i>d<b>e</b>f</i>g</span>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          const div = document.createElement('div')
          const span = document.querySelector('span')!
          document.body.appendChild(div)
          div.appendChild(span)
        })

        await flushEvents()

        const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidatorFromSegment(
          getFirstSegment(events)
        )

        const div = expectNewNode({ type: NodeType.Element, tagName: 'div' })

        validate({
          adds: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: div.withChildren(
                expectInitialNode({ tag: 'span' }).withChildren(
                  expectInitialNode({ text: 'c' }),
                  expectInitialNode({ tag: 'i' }).withChildren(
                    expectInitialNode({ text: 'd' }),
                    expectInitialNode({ tag: 'b' }).withChildren(expectInitialNode({ text: 'e' })),
                    expectInitialNode({ text: 'f' })
                  ),
                  expectInitialNode({ text: 'g' })
                )
              ),
            },
          ],
          removes: [
            {
              parent: expectInitialNode({ tag: 'body' }),
              node: expectInitialNode({ tag: 'span' }),
            },
          ],
        })
      })

    createTest('serialize node before record')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        // prettier-ignore
        html`
          <ul><li></li></ul>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          const ul = document.querySelector('ul') as HTMLUListElement
          let count = 3
          while (count > 0) {
            count--
            const li = document.createElement('li')
            ul.appendChild(li)
          }
        })

        await flushEvents()

        const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidatorFromSegment(
          getFirstSegment(events)
        )

        const ul = expectInitialNode({ tag: 'ul' })
        const li1 = expectNewNode({ type: NodeType.Element, tagName: 'li' })
        const li2 = expectNewNode({ type: NodeType.Element, tagName: 'li' })
        const li3 = expectNewNode({ type: NodeType.Element, tagName: 'li' })

        validate({
          adds: [
            {
              parent: ul,
              node: li1,
            },
            {
              next: li1,
              parent: ul,
              node: li2,
            },
            {
              next: li2,
              parent: ul,
              node: li3,
            },
          ],
        })
      })
  })

  describe('input observers', () => {
    createTest('record input interactions')
      .withRum({
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <form>
            <label for="text">
              <input type="text" id="text-input" />
            </label>
            <label for="radio">
              <input type="radio" id="radio-input" />
            </label>
            <label for="checkbox">
              <input type="checkbox" id="checkbox-input" />
            </label>
            <label for="textarea">
              <textarea name="" id="textarea" cols="30" rows="10"></textarea>
            </label>
            <label for="select">
              <select name="" id="select">
                <option value="1">1</option>
                <option value="2">2</option>
              </select>
            </label>
          </form>
        `
      )
      .run(async ({ events }) => {
        const textInput = await $('#text-input')
        await textInput.setValue('test')

        const radioInput = await $('#radio-input')
        await radioInput.click()

        const checkboxInput = await $('#checkbox-input')
        await checkboxInput.click()

        const textarea = await $('#textarea')
        await textarea.setValue('textarea test')

        const select = await $('#select')
        await select.selectByAttribute('value', '2')

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(events)

        const textInputRecords = filterRecordsByIdAttribute(segment, 'text-input')
        expect(textInputRecords.length).toBeGreaterThanOrEqual(4)
        expect((textInputRecords[textInputRecords.length - 1].data as { text?: string }).text).toBe('test')

        const radioInputRecords = filterRecordsByIdAttribute(segment, 'radio-input')
        expect(radioInputRecords.length).toBe(1)
        expect((radioInputRecords[0].data as { text?: string }).text).toBe(undefined)
        expect((radioInputRecords[0].data as { isChecked?: boolean }).isChecked).toBe(true)

        const checkboxInputRecords = filterRecordsByIdAttribute(segment, 'checkbox-input')
        expect(checkboxInputRecords.length).toBe(1)
        expect((checkboxInputRecords[0].data as { text?: string }).text).toBe(undefined)
        expect((checkboxInputRecords[0].data as { isChecked?: boolean }).isChecked).toBe(true)

        const textareaRecords = filterRecordsByIdAttribute(segment, 'textarea')
        expect(textareaRecords.length).toBeGreaterThanOrEqual(4)
        expect((textareaRecords[textareaRecords.length - 1].data as { text?: string }).text).toBe('textarea test')

        const selectRecords = filterRecordsByIdAttribute(segment, 'select')
        expect(selectRecords.length).toBe(1)
        expect((selectRecords[0].data as { text?: string }).text).toBe('2')

        function filterRecordsByIdAttribute(segment: Segment, idAttribute: string) {
          const fullSnapshot = findFullSnapshot(segment)!
          const id = findElementWithIdAttribute(fullSnapshot.data.node, idAttribute)!.id
          const records = findAllIncrementalSnapshots(segment, IncrementalSource.Input) as Array<{ data: InputData }>
          return records.filter((record) => record.data.id === id)
        }
      })

    createTest("don't record ignored input interactions")
      .withRum({
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <input type="text" id="first" name="first" />
          <input type="text" id="second" name="second" data-dd-privacy="input-ignored" />
          <input type="text" id="third" name="third" class="dd-privacy-input-ignored" />
          <input type="password" id="fourth" name="fourth" />
        `
      )
      .run(async ({ events }) => {
        const firstInput = await $('#first')
        await firstInput.setValue('foo')

        const secondInput = await $('#second')
        await secondInput.setValue('bar')

        const thirdInput = await $('#third')
        await thirdInput.setValue('baz')

        const fourthInput = await $('#fourth')
        await fourthInput.setValue('quux')

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(events)

        const inputRecords = findAllIncrementalSnapshots(segment, IncrementalSource.Input)

        expect(inputRecords.length).toBeGreaterThanOrEqual(3) // 4 on Safari, 3 on others
        expect((inputRecords[inputRecords.length - 1].data as { text?: string }).text).toBe('***')
      })

    createTest('replace masked values by asterisks')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <input type="text" id="by-data-attribute" data-dd-privacy="input-masked" />
          <input type="text" id="by-classname" class="dd-privacy-input-masked" />
        `
      )
      .run(async ({ events }) => {
        const firstInput = await $('#by-data-attribute')
        await firstInput.setValue('foo')

        const secondInput = await $('#by-classname')
        await secondInput.setValue('bar')

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(events)

        const inputRecords = findAllIncrementalSnapshots(segment, IncrementalSource.Input)

        expect(inputRecords.length).toBeGreaterThan(0)

        expect(inputRecords.every((inputRecord) => /^\**$/.test((inputRecord.data as { text: string }).text))).toBe(
          true
        )
      })
  })

  describe('stylesheet rules observer', () => {
    createTest('record dynamic CSS changes')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <style>
            .foo {
            }
            .bar {
            }
          </style>
        `
      )
      .run(async ({ events }) => {
        await browserExecute(() => {
          document.styleSheets[0].deleteRule(0)
          document.styleSheets[0].insertRule('.added {}', 0)
        })

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(events)

        const styleSheetRules = findAllIncrementalSnapshots(segment, IncrementalSource.StyleSheetRule) as Array<{
          data: StyleSheetRuleData
        }>

        expect(styleSheetRules.length).toBe(2)
        expect(styleSheetRules[0].data.removes).toEqual([{ index: 0 }])
        expect(styleSheetRules[1].data.adds).toEqual([{ rule: '.added {}', index: 0 }])
      })
  })

  describe('session renewal', () => {
    createTest('a single fullSnapshot is taken when the session is renewed')
      .withRum()
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .run(async ({ events }) => {
        await renewSession()

        await flushEvents()

        expect(events.sessionReplay.length).toBe(2)

        const segment = getLastSegment(events)
        expect(segment.creation_reason).toBe('init')
        expect(segment.records[0].type).toBe(RecordType.Meta)
        expect(segment.records[1].type).toBe(RecordType.Focus)
        expect(segment.records[2].type).toBe(RecordType.FullSnapshot)
        expect(segment.records.slice(3).every((record) => record.type !== RecordType.FullSnapshot)).toBe(true)
      })
  })

  describe('layout viewport properties - ', () => {
    createTest('getWindowWidth/Height reports using layout viewport dimensions')
      .withRum({ enableExperimentalFeatures: ['visualviewport'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ events }) => {
        /**
         * InnerWidth/Height on some devices/browsers are changed by pinch zoom
         * We need to ensure that our measurements are not affected by pinch zoom
         */
        if (isGestureUnsupported()) {
          return // No Fallback test
        }
        await resetViewport()

        const { innerWidth, innerHeight } = (await browserExecute(() => ({
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        }))) as { innerWidth: number; innerHeight: number }

        const initialVisualViewport = await getVisualViewport()
        await pinchZoom(150)
        await pinchZoom(150)
        await sleep(210)
        const nextVisualViewport = await getVisualViewport()

        await browserExecute(() => {
          window.dispatchEvent(new Event('resize'))
        })
        await sleep(210)

        await flushEvents()
        const segment = getLastSegment(events)
        const ViewportResizeRecords = findAllIncrementalSnapshots(segment, IncrementalSource.ViewportResize)

        const lastViewportResizeRecord = ViewportResizeRecords.slice(-1)[0].data as ViewportResizeData

        expectToBeNearby(Math.round(lastViewportResizeRecord.width), innerWidth)
        expectToBeNearby(Math.round(lastViewportResizeRecord.height), innerHeight)
        // Test the test: ensure the pinch zoom worked
        expect(initialVisualViewport.scale < nextVisualViewport.scale).toBeTruthy()
      })

    createTest('scrollX/Y reports using layout viewport dimensions')
      .withRum({ enableExperimentalFeatures: ['visualviewport'] })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(html`${VIEWPORT_META_TAGS}`)
      .run(async ({ events }) => {
        /**
         * ScrollX/Y on some devices/browsers are changed by pinch zoom
         * We need to ensure that our measurements are not affected by pinch zoom
         */
        const SCROLL_DOWN_PX = 60

        if (isGestureUnsupported()) {
          return // No Fallback test
        }
        await resetViewport()

        await browserExecute(() => {
          window.scrollTo(-500, -500)
        })

        await sleep(210)
        await pinchZoom(150)
        await pinchZoom(150)
        await sleep(210)

        await browserExecute(() => {
          window.scrollTo(-500, -500)
        })

        const { scrollX: baseScrollX, scrollY: baseScrollY } = await getWindowScroll()

        const preVisualViewport = await getVisualViewport()

        // NOTE: Due to scrolling down, the hight of the page changed.
        // Given time constraints, this should be a follow up once more experience is gained via data collection
        await pinchScrollVerticallyDown(SCROLL_DOWN_PX) // Scroll Down on Android
        await sleep(210)

        const { scrollX: nextScrollX, scrollY: nextScrollY } = await getWindowScroll()
        const nextVisualViewport = await getVisualViewport()

        await browserExecute(() => {
          document.dispatchEvent(new Event('scroll'))
        })
        await sleep(210)

        await flushEvents()
        const segment = getLastSegment(events)
        const lastScrollRecords = findAllIncrementalSnapshots(segment, IncrementalSource.Scroll)
        const lastScrollRecord = lastScrollRecords.slice(-1)[0].data as ScrollData

        // Layout Viewport should not change
        expect(baseScrollX).toBe(0)
        expect(baseScrollY).toBe(0)
        expect(nextScrollX).toBe(0)
        expect(nextScrollY).toBe(0)

        // NOTE: Height changes because URL address bar changes
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

  describe('visual viewport properties - ', () => {
    createTest('pinch scroll event tracked reports visual viewport page offset')
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
        await pinchZoom(150)
        await pinchZoom(150)
        await sleep(210)

        const middleVisualViewportDimension = await getVisualViewport()
        await pinchScrollVerticallyDown(SCROLL_DOWN_PX) // Trigger a resize event
        await sleep(210)

        const nextVisualViewportDimension = await getVisualViewport()
        await flushEvents()

        const segment = getLastSegment(events)
        const visualViewportRecords = findAllVisualViewport(segment)
        const lastVisualViewportRecord = visualViewportRecords.slice(-1)[0]

        // NOTE: Height changes because URL address bar changes
        const heightChange = nextVisualViewportDimension.height - middleVisualViewportDimension.height
        expect(heightChange).toBeLessThanOrEqual(30)

        // Stay the same
        expectToBeNearby(lastVisualViewportRecord.data.scale, nextVisualViewportDimension.scale)
        expectToBeNearby(lastVisualViewportRecord.data.width, nextVisualViewportDimension.width)
        expectToBeNearby(lastVisualViewportRecord.data.height, nextVisualViewportDimension.height)

        // Non-zero
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

    createTest('pinch zoom event tracked reports visual viewport scale and dimension')
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
        await pinchZoom(170)
        await sleep(210)
        const nextVisualViewportDimension = await getVisualViewport()

        await flushEvents()
        const segment = getLastSegment(events)
        const visualViewportRecords = findAllVisualViewport(segment)
        const lastVisualViewportRecord = visualViewportRecords.slice(-1)[0]

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

export function getFirstSegment(events: EventRegistry) {
  return events.sessionReplay[0].segment.data
}

export function getLastSegment(events: EventRegistry) {
  return events.sessionReplay[events.sessionReplay.length - 1].segment.data
}

export function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}

export async function pinchZoom(xChange = 50, durationMS = 400) {
  const xBase = 180
  const yBase = 180
  const xOffsetFingerTwo = 25
  const actions = [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: xBase, y: yBase },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 150 },
        { type: 'pointerMove', duration: durationMS, origin: 'pointer', x: -xChange, y: 0 },
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
        { type: 'pause', duration: 150 },
        { type: 'pointerMove', duration: durationMS, origin: 'pointer', x: +xChange, y: 0 },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]
  return driver.performActions(actions)
}

// Providing a negative offset value will scroll up.
export async function pinchScrollVerticallyDown(yChange = 50) {
  // NOTE: Some devices may invert scroll direction
  const durationMS = 1000
  const xBase = 180
  const yBase = 180

  const actions = [
    {
      type: 'pointer',
      id: 'finger1',
      parameters: { pointerType: 'touch' },
      actions: [
        { type: 'pointerMove', duration: 0, x: xBase, y: yBase },
        { type: 'pointerDown', button: 0 },
        { type: 'pause', duration: 150 },
        { type: 'pointerMove', duration: durationMS, origin: 'pointer', x: 0, y: -yChange },
        { type: 'pointerUp', button: 0 },
      ],
    },
  ]
  return driver.performActions(actions)
}

export async function resetViewport() {
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
