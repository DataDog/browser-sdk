import type {
  InputData,
  StyleSheetRuleData,
  CreationReason,
  BrowserSegment,
  ScrollData,
} from '@datadog/browser-rum/src/types'
import { NodeType, IncrementalSource, RecordType, MouseInteractionType } from '@datadog/browser-rum/src/types'

import type { RumInitConfiguration } from '@datadog/browser-rum-core'
import { FrustrationType } from '@datadog/browser-rum-core'
import { DefaultPrivacyLevel } from '@datadog/browser-rum'

import {
  findElement,
  findElementWithIdAttribute,
  findFullSnapshot,
  findIncrementalSnapshot,
  findAllIncrementalSnapshots,
  findMeta,
  findTextContent,
  createMutationPayloadValidatorFromSegment,
  findAllFrustrationRecords,
  findMouseInteractionRecords,
  findElementWithTagName,
} from '@datadog/browser-rum/test/utils'
import { renewSession } from '../../lib/helpers/session'
import type { EventRegistry } from '../../lib/framework'
import { flushEvents, createTest, bundleSetup, html } from '../../lib/framework'
import { browserExecute, browserExecuteAsync } from '../../lib/helpers/browser'

const INTEGER_RE = /^\d+$/
const TIMESTAMP_RE = /^\d{13}$/
const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/

describe('recorder', () => {
  createTest('record mouse move')
    .withRum()
    .withRumInit(initRumAndStartRecording)
    .run(async ({ serverEvents }) => {
      await browserExecute(() => document.documentElement.outerHTML)
      const html = await $('html')
      await html.click()
      await flushEvents()

      expect(serverEvents.sessionReplay.length).toBe(1)
      const { segment, metadata } = serverEvents.sessionReplay[0]
      expect(metadata).toEqual({
        'application.id': jasmine.stringMatching(UUID_RE),
        creation_reason: 'init',
        end: jasmine.stringMatching(TIMESTAMP_RE),
        has_full_snapshot: 'true',
        records_count: jasmine.stringMatching(INTEGER_RE),
        'session.id': jasmine.stringMatching(UUID_RE),
        start: jasmine.stringMatching(TIMESTAMP_RE),
        'view.id': jasmine.stringMatching(UUID_RE),
        raw_segment_size: jasmine.stringMatching(INTEGER_RE),
        index_in_view: '0',
        source: 'browser',
      })
      expect(segment).toEqual({
        data: {
          application: { id: metadata['application.id'] },
          creation_reason: metadata.creation_reason as CreationReason,
          end: Number(metadata.end),
          has_full_snapshot: true,
          records: jasmine.any(Array),
          records_count: Number(metadata.records_count),
          session: { id: metadata['session.id'] },
          start: Number(metadata.start),
          view: { id: metadata['view.id'] },
          index_in_view: 0,
          source: 'browser',
        },
        encoding: jasmine.any(String),
        filename: `${metadata['session.id']}-${metadata.start}`,
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
      .run(async ({ serverEvents }) => {
        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)

        const fullSnapshot = findFullSnapshot(getFirstSegment(serverEvents))!

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
      .run(async ({ serverEvents }) => {
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
          getFirstSegment(serverEvents)
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
      .run(async ({ serverEvents }) => {
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
          getFirstSegment(serverEvents)
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
      .run(async ({ serverEvents }) => {
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

        const { validate, expectInitialNode } = createMutationPayloadValidatorFromSegment(getFirstSegment(serverEvents))

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
      .run(async ({ serverEvents }) => {
        await browserExecute(() => {
          document.querySelector('div')!.setAttribute('foo', 'bar')
          document.querySelector('li')!.textContent = 'hop'
          document.querySelector('div')!.appendChild(document.createElement('p'))
        })

        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)
        const segment = getFirstSegment(serverEvents)

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
      .run(async ({ serverEvents }) => {
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

        const { validate, expectInitialNode } = createMutationPayloadValidatorFromSegment(getFirstSegment(serverEvents))
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
      .run(async ({ serverEvents }) => {
        await browserExecute(() => {
          const div = document.createElement('div')
          const span = document.querySelector('span')!
          document.body.appendChild(div)
          div.appendChild(span)
        })

        await flushEvents()

        const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidatorFromSegment(
          getFirstSegment(serverEvents)
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
      .run(async ({ serverEvents }) => {
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
          getFirstSegment(serverEvents)
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
      .run(async ({ serverEvents }) => {
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

        expect(serverEvents.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(serverEvents)

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

        function filterRecordsByIdAttribute(segment: BrowserSegment, idAttribute: string) {
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
      .run(async ({ serverEvents }) => {
        const firstInput = await $('#first')
        await firstInput.setValue('foo')

        const secondInput = await $('#second')
        await secondInput.setValue('bar')

        const thirdInput = await $('#third')
        await thirdInput.setValue('baz')

        const fourthInput = await $('#fourth')
        await fourthInput.setValue('quux')

        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(serverEvents)

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
      .run(async ({ serverEvents }) => {
        const firstInput = await $('#by-data-attribute')
        await firstInput.setValue('foo')

        const secondInput = await $('#by-classname')
        await secondInput.setValue('bar')

        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(serverEvents)

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
      .run(async ({ serverEvents }) => {
        await browserExecute(() => {
          document.styleSheets[0].deleteRule(0)
          document.styleSheets[0].insertRule('.added {}', 0)
        })

        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)

        const segment = getFirstSegment(serverEvents)

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
      .run(async ({ serverEvents }) => {
        await renewSession()

        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(2)

        const segment = getLastSegment(serverEvents)
        expect(segment.creation_reason).toBe('init')
        expect(segment.records[0].type).toBe(RecordType.Meta)
        expect(segment.records[1].type).toBe(RecordType.Focus)
        expect(segment.records[2].type).toBe(RecordType.FullSnapshot)
        expect(segment.records.slice(3).every((record) => record.type !== RecordType.FullSnapshot)).toBe(true)
      })
  })

  describe('frustration records', () => {
    createTest('should detect a dead click and match it to mouse interaction record')
      .withRum({ trackFrustrations: true })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .run(async ({ serverEvents }) => {
        const html = await $('html')
        await html.click()
        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)
        const { segment } = serverEvents.sessionReplay[0]

        const clickRecords = findMouseInteractionRecords(segment.data, MouseInteractionType.Click)
        const frustrationRecords = findAllFrustrationRecords(segment.data)

        expect(clickRecords.length).toBe(1)
        expect(clickRecords[0].id).toBeTruthy('mouse interaction record should have an id')
        expect(frustrationRecords.length).toBe(1)
        expect(frustrationRecords[0].data).toEqual({
          frustrationTypes: [FrustrationType.DEAD_CLICK],
          recordIds: [clickRecords[0].id!],
        })
      })

    createTest('should detect a rage click and match it to mouse interaction records')
      .withRum({ trackFrustrations: true })
      .withRumInit(initRumAndStartRecording)
      .withSetup(bundleSetup)
      .withBody(
        html`
          <div id="main-div" />
          <button
            id="my-button"
            onclick="document.querySelector('#main-div').appendChild(document.createElement('div'));"
          />
        `
      )
      .run(async ({ serverEvents }) => {
        const button = await $('#my-button')
        await Promise.all([button.click(), button.click(), button.click(), button.click()])
        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(1)
        const { segment } = serverEvents.sessionReplay[0]

        const clickRecords = findMouseInteractionRecords(segment.data, MouseInteractionType.Click)
        const frustrationRecords = findAllFrustrationRecords(segment.data)

        expect(clickRecords.length).toBe(4)
        expect(frustrationRecords.length).toBe(1)
        expect(frustrationRecords[0].data).toEqual({
          frustrationTypes: [FrustrationType.RAGE_CLICK],
          recordIds: clickRecords.map((r) => r.id!),
        })
      })
  })

  describe('scroll positions', () => {
    createTest('should be recorded across navigation')
      .withRum()
      .withSetup(bundleSetup)
      .withBody(
        html`
          <style>
            #container {
              width: 100px;
              height: 100px;
              overflow-x: scroll;
            }
            #content {
              width: 250px;
            }
            #big-element {
              height: 4000px;
            }
          </style>
          <div id="container">
            <div id="content">I'm bigger than the container</div>
          </div>
          <div id="big-element"></div>
        `
      )
      .run(async ({ serverEvents }) => {
        async function scroll({ windowY, containerX }: { windowY: number; containerX: number }) {
          return browserExecuteAsync(
            (windowY, containerX, done) => {
              let scrollCount = 0

              document.addEventListener(
                'scroll',
                () => {
                  scrollCount++
                  if (scrollCount === 2) {
                    // ensure to bypass observer throttling
                    setTimeout(done, 100)
                  }
                },
                { capture: true, passive: true }
              )

              window.scrollTo(0, windowY)
              document.getElementById('container')!.scrollTo(containerX, 0)
            },
            windowY,
            containerX
          )
        }

        // initial scroll positions
        await scroll({ windowY: 100, containerX: 10 })

        await browserExecute(() => {
          window.DD_RUM!.startSessionReplayRecording()
        })

        // wait for recorder to be properly started
        await browser.pause(200)

        // update scroll positions
        await scroll({ windowY: 150, containerX: 20 })

        // trigger new full snapshot
        await browserExecute(() => {
          window.DD_RUM!.startView()
        })

        await flushEvents()

        expect(serverEvents.sessionReplay.length).toBe(2)
        const firstSegment = getFirstSegment(serverEvents)

        const firstFullSnapshot = findFullSnapshot(firstSegment)!
        let htmlElement = findElementWithTagName(firstFullSnapshot.data.node, 'html')!
        expect(htmlElement.attributes.rr_scrollTop).toBe(100)
        let containerElement = findElementWithIdAttribute(firstFullSnapshot.data.node, 'container')!
        expect(containerElement.attributes.rr_scrollLeft).toBe(10)

        const scrollRecords = findAllIncrementalSnapshots(firstSegment, IncrementalSource.Scroll)
        expect(scrollRecords.length).toBe(2)
        const [windowScrollData, containerScrollData] = scrollRecords.map((record) => record.data as ScrollData)
        expect(windowScrollData.y).toEqual(150)
        expect(containerScrollData.x).toEqual(20)

        const secondFullSnapshot = findFullSnapshot(getLastSegment(serverEvents))!
        htmlElement = findElementWithTagName(secondFullSnapshot.data.node, 'html')!
        expect(htmlElement.attributes.rr_scrollTop).toBe(150)
        containerElement = findElementWithIdAttribute(secondFullSnapshot.data.node, 'container')!
        expect(containerElement.attributes.rr_scrollLeft).toBe(20)
      })
  })
})

function getFirstSegment(events: EventRegistry) {
  return events.sessionReplay[0].segment.data
}

function getLastSegment(events: EventRegistry) {
  return events.sessionReplay[events.sessionReplay.length - 1].segment.data
}

function initRumAndStartRecording(initConfiguration: RumInitConfiguration) {
  window.DD_RUM!.init(initConfiguration)
  window.DD_RUM!.startSessionReplayRecording()
}
