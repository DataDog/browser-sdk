import { CreationReason, IncrementalSource, Segment } from '@datadog/browser-rum-recorder/cjs/types'
import { InputData, StyleSheetRuleData } from '@datadog/browser-rum-recorder/cjs/domain/rrweb/types'

import { NodeType } from '@datadog/browser-rum-recorder/cjs/domain/rrweb-snapshot'
import { createTest, bundleSetup, html } from '../lib/framework'
import { browserExecute } from '../lib/helpers/browser'
import { flushEvents } from '../lib/helpers/sdk'
import {
  findElementWithIdAttribute,
  findFullSnapshot,
  findIncrementalSnapshot,
  findAllIncrementalSnapshots,
  findMeta,
  findTextContent,
  validateMutations,
} from '../../../packages/rum-recorder/test/utils'

const INTEGER_RE = /^\d+$/
const TIMESTAMP_RE = /^\d{13}$/
const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/

describe('recorder', () => {
  createTest('record mouse move')
    .withRumRecorder()
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

  describe('snapshot', () => {
    createTest('obfuscate blocks')
      .withSetup(bundleSetup)
      .withRumRecorder()
      .withBody(
        html`
          <p id="foo">foo</p>
          <p id="bar" data-dd-privacy="hidden">bar</p>
          <p id="baz" class="dd-privacy-hidden baz">baz</p>
        `
      )
      .run(async ({ events }) => {
        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const fullSnapshot = findFullSnapshot(events.sessionReplay[0].segment.data)!

        const fooNode = findElementWithIdAttribute(fullSnapshot, 'foo')
        expect(fooNode).toBeTruthy()
        expect(findTextContent(fooNode!)).toBe('foo')

        const barNode = findElementWithIdAttribute(fullSnapshot, 'bar')
        expect(barNode).toBeTruthy()
        expect(barNode!.attributes['data-dd-privacy']).toBe('hidden')
        expect(barNode!.childNodes.length).toBe(0)

        const bazNode = findElementWithIdAttribute(fullSnapshot, 'baz')
        expect(bazNode).toBeTruthy()
        expect(bazNode!.attributes.class).toBe('dd-privacy-hidden baz')
        expect(bazNode!.attributes['data-dd-privacy']).toBe('hidden')
        expect(bazNode!.childNodes.length).toBe(0)
      })
  })

  describe('mutations observer', () => {
    createTest('record mutations')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        validateMutations(events.sessionReplay[0].segment.data, {
          adds: [
            {
              parent: { tag: 'p' },
              node: { tagName: 'span' },
            },
          ],
          removes: [
            {
              parent: { tag: 'body' },
              node: { tag: 'ul' },
            },
          ],
        })
      })

    createTest('record character data mutations')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        validateMutations(events.sessionReplay[0].segment.data, {
          adds: [
            {
              parent: { tag: 'p' },
              node: { type: NodeType.Text, textContent: 'mutated' },
            },
          ],
          removes: [
            {
              parent: { tag: 'body' },
              node: { tag: 'ul' },
            },
            {
              parent: { tag: 'p' },
              node: { text: 'mutation observer' },
            },
          ],
        })
      })

    createTest('record attributes mutations')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        validateMutations(events.sessionReplay[0].segment.data, {
          attributes: [
            {
              node: { tag: 'body' },
              attributes: { test: 'true' },
            },
          ],
          removes: [
            {
              parent: { tag: 'body' },
              node: { tag: 'ul' },
            },
          ],
        })
      })

    createTest("don't record hidden elements mutations")
      .withSetup(bundleSetup)
      .withRumRecorder()
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
        const segment = events.sessionReplay[0].segment.data

        expect(findAllIncrementalSnapshots(segment, IncrementalSource.Mutation)).toEqual([])
      })

    createTest('record DOM node movement 1')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        validateMutations(events.sessionReplay[0].segment.data, {
          adds: [
            {
              parent: { tag: 'div' },
              node: { from: { tag: 'span' }, childNodes: [] },
            },
            {
              next: { tag: 'i' },
              parent: { tag: 'span' },
              node: { from: { text: 'c' } },
            },
            {
              next: { text: 'g' },
              parent: { tag: 'span' },
              node: { from: { tag: 'i' }, childNodes: [] },
            },
            {
              next: { tag: 'b' },
              parent: { tag: 'i' },
              node: { from: { text: 'd' } },
            },
            {
              next: { text: 'f' },
              parent: { tag: 'i' },
              node: { from: { tag: 'b' }, childNodes: [] },
            },
            {
              parent: { tag: 'b' },
              node: { from: { text: 'e' } },
            },
            {
              parent: { tag: 'i' },
              node: { from: { text: 'f' } },
            },
            {
              parent: { tag: 'span' },
              node: { from: { text: 'g' } },
            },
          ],
          removes: [
            {
              parent: { tag: 'body' },
              node: { tag: 'span' },
            },
          ],
        })
      })

    createTest('record DOM node movement 2')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        validateMutations(events.sessionReplay[0].segment.data, {
          adds: [
            {
              next: { tag: 'i' },
              parent: { tag: 'span' },
              node: { from: { text: 'c' } },
            },
            {
              next: { text: 'g' },
              parent: { tag: 'span' },
              node: { from: { tag: 'i' }, childNodes: [] },
            },
            {
              next: { tag: 'b' },
              parent: { tag: 'i' },
              node: { from: { text: 'd' } },
            },
            {
              next: { text: 'f' },
              parent: { tag: 'i' },
              node: { from: { tag: 'b' }, childNodes: [] },
            },
            {
              parent: { tag: 'b' },
              node: { from: { text: 'e' } },
            },
            {
              parent: { tag: 'i' },
              node: { from: { text: 'f' } },
            },
            {
              parent: { tag: 'span' },
              node: { from: { text: 'g' } },
            },
            {
              parent: { tag: 'body' },
              node: { tagName: 'div' },
            },
            {
              parent: { created: 0 },
              node: { from: { tag: 'span' }, childNodes: [] },
            },
          ],
          removes: [
            {
              parent: { tag: 'body' },
              node: { tag: 'span' },
            },
          ],
        })
      })

    createTest('serialize node before record')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        validateMutations(events.sessionReplay[0].segment.data, {
          adds: [
            {
              parent: { tag: 'ul' },
              node: { tagName: 'li' },
            },
            {
              next: { created: 0 },
              parent: { tag: 'ul' },
              node: { tagName: 'li' },
            },
            {
              next: { created: 1 },
              parent: { tag: 'ul' },
              node: { tagName: 'li' },
            },
          ],
        })
      })
  })

  describe('input observers', () => {
    createTest('record input interactions')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        const segment = events.sessionReplay[0].segment.data

        const textInputRecords = filterRecordsByIdAttribute(segment, 'text-input')
        expect(textInputRecords.length).toBeGreaterThanOrEqual(4)
        expect(textInputRecords[textInputRecords.length - 1].data.text).toBe('test')

        const radioInputRecords = filterRecordsByIdAttribute(segment, 'radio-input')
        expect(radioInputRecords.length).toBe(1)
        expect(radioInputRecords[0].data.text).toBe('on')
        expect(radioInputRecords[0].data.isChecked).toBe(true)

        const checkboxInputRecords = filterRecordsByIdAttribute(segment, 'checkbox-input')
        expect(checkboxInputRecords.length).toBe(1)
        expect(checkboxInputRecords[0].data.text).toBe('on')
        expect(checkboxInputRecords[0].data.isChecked).toBe(true)

        const textareaRecords = filterRecordsByIdAttribute(segment, 'textarea')
        expect(textareaRecords.length).toBeGreaterThanOrEqual(4)
        expect(textareaRecords[textareaRecords.length - 1].data.text).toBe('textarea test')

        const selectRecords = filterRecordsByIdAttribute(segment, 'select')
        expect(selectRecords.length).toBe(1)
        expect(selectRecords[0].data.text).toBe('2')

        function filterRecordsByIdAttribute(segment: Segment, idAttribute: string) {
          const fullSnapshot = findFullSnapshot(segment)!
          const id = findElementWithIdAttribute(fullSnapshot, idAttribute)!.id
          const records = findAllIncrementalSnapshots(segment, IncrementalSource.Input) as Array<{ data: InputData }>
          return records.filter((record) => record.data.id === id)
        }
      })

    createTest("don't record ignored input interactions")
      .withSetup(bundleSetup)
      .withRumRecorder()
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
        const { segment } = events.sessionReplay[0]

        const inputRecords = findAllIncrementalSnapshots(segment.data, IncrementalSource.Input)

        expect(inputRecords.length).toBeGreaterThanOrEqual(3) // 4 on Safari, 3 on others
        expect((inputRecords[inputRecords.length - 1].data as InputData).text).toBe('foo')
      })
  })

  describe('stylesheet rules observer', () => {
    createTest('record dynamic CSS changes')
      .withSetup(bundleSetup)
      .withRumRecorder()
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

        const segment = events.sessionReplay[0].segment.data

        const styleSheetRules = findAllIncrementalSnapshots(segment, IncrementalSource.StyleSheetRule) as Array<{
          data: StyleSheetRuleData
        }>

        expect(styleSheetRules.length).toBe(2)
        expect(styleSheetRules[0].data.removes).toEqual([{ index: 0 }])
        expect(styleSheetRules[1].data.adds).toEqual([{ rule: '.added {}', index: 0 }])
      })
  })
})
