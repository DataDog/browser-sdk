import { CreationReason, IncrementalSource, Segment } from '@datadog/browser-rum-recorder/cjs/types'
import { InputData, MutationData, StyleSheetRuleData } from '@datadog/browser-rum-recorder/cjs/domain/rrweb/types'

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
  findElementWithTagName,
  findTextNode,
} from '../lib/helpers/recorder'

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
          ul.appendChild(li)
          document.body.removeChild(ul)
          const p = document.querySelector('p') as HTMLParagraphElement
          p.appendChild(document.createElement('span'))
        })

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = events.sessionReplay[0].segment.data
        const fullSnapshot = findFullSnapshot(segment)!
        const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
          data: MutationData
        }>

        expect(mutations.length).toBe(1)

        expect(mutations[0].data.adds).toEqual([
          {
            nextId: null,
            parentId: findElementWithTagName(fullSnapshot, 'p')!.id,
            node: jasmine.objectContaining({ tagName: 'span' }),
          },
        ])
        expect(mutations[0].data.removes).toEqual([
          {
            parentId: findElementWithTagName(fullSnapshot, 'body')!.id,
            id: findElementWithTagName(fullSnapshot, 'ul')!.id,
          },
        ])
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
          ul.appendChild(li)
          li.innerText = 'new list item'
          li.innerText = 'new list item edit'
          document.body.removeChild(ul)
          const p = document.querySelector('p') as HTMLParagraphElement
          p.innerText = 'mutated'
        })

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = events.sessionReplay[0].segment.data
        const fullSnapshot = findFullSnapshot(segment)!
        const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
          data: MutationData
        }>

        expect(mutations.length).toBe(1)

        expect(mutations[0].data.adds).toEqual([
          {
            nextId: null,
            parentId: findElementWithTagName(fullSnapshot, 'p')!.id,
            node: jasmine.objectContaining({ textContent: 'mutated' }),
          },
        ])
        expect(mutations[0].data.removes).toEqual([
          {
            parentId: findElementWithTagName(fullSnapshot, 'body')!.id,
            id: findElementWithTagName(fullSnapshot, 'ul')!.id,
          },
          {
            parentId: findElementWithTagName(fullSnapshot, 'p')!.id,
            id: findTextNode(fullSnapshot, 'mutation observer')!.id,
          },
        ])
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
          ul.appendChild(li)
          li.setAttribute('foo', 'bar')
          document.body.removeChild(ul)
          document.body.setAttribute('test', 'true')
        })

        await flushEvents()

        expect(events.sessionReplay.length).toBe(1)

        const segment = events.sessionReplay[0].segment.data
        const fullSnapshot = findFullSnapshot(segment)!
        const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
          data: MutationData
        }>

        expect(mutations.length).toBe(1)

        expect(mutations[0].data.attributes).toEqual([
          {
            id: findElementWithTagName(fullSnapshot, 'body')!.id,
            attributes: { test: 'true' },
          },
        ])
        expect(mutations[0].data.removes).toEqual([
          {
            parentId: findElementWithTagName(fullSnapshot, 'body')!.id,
            id: findElementWithTagName(fullSnapshot, 'ul')!.id,
          },
        ])
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

        expect(events.sessionReplay.length).toBe(1)
        const segment = events.sessionReplay[0].segment.data
        const fullSnapshot = findFullSnapshot(segment)!

        const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
          data: MutationData
        }>

        expect(mutations.length).toBe(1)

        const divElement = findElementWithTagName(fullSnapshot, 'div')!
        const spanElement = findElementWithTagName(fullSnapshot, 'span')!
        const iElement = findElementWithTagName(fullSnapshot, 'i')!
        const bElement = findElementWithTagName(fullSnapshot, 'b')!
        expect(mutations[0].data.adds).toEqual([
          {
            nextId: null,
            parentId: divElement.id,
            node: { ...spanElement, childNodes: [] },
          },
          {
            nextId: iElement.id,
            parentId: spanElement.id,
            node: findTextNode(fullSnapshot, 'c')!,
          },
          {
            nextId: findTextNode(fullSnapshot, 'g')!.id,
            parentId: spanElement.id,
            node: { ...iElement, childNodes: [] },
          },
          {
            nextId: bElement.id,
            parentId: iElement.id,
            node: findTextNode(fullSnapshot, 'd')!,
          },
          {
            nextId: findTextNode(fullSnapshot, 'f')!.id,
            parentId: iElement.id,
            node: { ...bElement, childNodes: [] },
          },
          {
            nextId: null,
            parentId: bElement.id,
            node: findTextNode(fullSnapshot, 'e')!,
          },
          {
            nextId: null,
            parentId: iElement.id,
            node: findTextNode(fullSnapshot, 'f')!,
          },
          {
            nextId: null,
            parentId: spanElement.id,
            node: findTextNode(fullSnapshot, 'g')!,
          },
        ])
        expect(mutations[0].data.removes).toEqual([
          {
            parentId: findElementWithTagName(fullSnapshot, 'body')!.id,
            id: spanElement.id,
          },
        ])
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

        expect(events.sessionReplay.length).toBe(1)
        const segment = events.sessionReplay[0].segment.data
        const fullSnapshot = findFullSnapshot(segment)!

        const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
          data: MutationData
        }>

        expect(mutations.length).toBe(1)

        const bodyElement = findElementWithTagName(fullSnapshot, 'body')!
        const spanElement = findElementWithTagName(fullSnapshot, 'span')!
        const iElement = findElementWithTagName(fullSnapshot, 'i')!
        const bElement = findElementWithTagName(fullSnapshot, 'b')!
        const newDivElement = mutations[0].data.adds[7].node
        expect(mutations[0].data.adds).toEqual([
          {
            nextId: iElement.id,
            parentId: spanElement.id,
            node: findTextNode(fullSnapshot, 'c')!,
          },
          {
            nextId: findTextNode(fullSnapshot, 'g')!.id,
            parentId: spanElement.id,
            node: { ...iElement, childNodes: [] },
          },
          {
            nextId: bElement.id,
            parentId: iElement.id,
            node: findTextNode(fullSnapshot, 'd')!,
          },
          {
            nextId: findTextNode(fullSnapshot, 'f')!.id,
            parentId: iElement.id,
            node: { ...bElement, childNodes: [] },
          },
          {
            nextId: null,
            parentId: bElement.id,
            node: findTextNode(fullSnapshot, 'e')!,
          },
          {
            nextId: null,
            parentId: iElement.id,
            node: findTextNode(fullSnapshot, 'f')!,
          },
          {
            nextId: null,
            parentId: spanElement.id,
            node: findTextNode(fullSnapshot, 'g')!,
          },
          {
            nextId: null,
            parentId: bodyElement.id,
            node: newDivElement,
          },
          {
            nextId: null,
            parentId: newDivElement.id,
            node: { ...spanElement, childNodes: [] },
          },
        ])
        expect(mutations[0].data.removes).toEqual([
          {
            parentId: bodyElement.id,
            id: spanElement.id,
          },
        ])
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

        expect(events.sessionReplay.length).toBe(1)
        const segment = events.sessionReplay[0].segment.data
        const fullSnapshot = findFullSnapshot(segment)!

        const mutations = findAllIncrementalSnapshots(segment, IncrementalSource.Mutation) as Array<{
          data: MutationData
        }>

        expect(mutations.length).toBe(1)

        const ulElement = findElementWithTagName(fullSnapshot, 'ul')!
        const lastId = findElementWithTagName(fullSnapshot, 'body')!.childNodes[2].id
        expect(mutations[0].data.adds).toEqual([
          {
            nextId: null,
            parentId: ulElement.id,
            node: jasmine.objectContaining({ tagName: 'li', id: lastId + 1 }),
          },
          {
            nextId: lastId + 1,
            parentId: ulElement.id,
            node: jasmine.objectContaining({ tagName: 'li', id: lastId + 2 }),
          },
          {
            nextId: lastId + 2,
            parentId: ulElement.id,
            node: jasmine.objectContaining({ tagName: 'li', id: lastId + 3 }),
          },
        ])
        expect(mutations[0].data.removes).toEqual([])
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
