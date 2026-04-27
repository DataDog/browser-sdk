import type { InputData, StyleSheetRuleData, ScrollData } from '@datadog/browser-rum/src/types'
import { NodeType, IncrementalSource, SnapshotFormat, ChangeType, RecordType } from '@datadog/browser-rum/src/types'

import { DefaultPrivacyLevel } from '@datadog/browser-core'

import { decodeChangeRecords, findChangeRecords } from '@datadog/browser-rum/test/record/changes'
import {
  getElementIdsFromFullSnapshot,
  getScrollPositionsFromFullSnapshot,
} from '@datadog/browser-rum/test/record/elements'
import { findElement, findElementWithIdAttribute, findTextContent } from '@datadog/browser-rum/test/record/nodes'
import {
  findFullSnapshot,
  findIncrementalSnapshot,
  findAllIncrementalSnapshots,
  findMeta,
  findFullSnapshotInFormat,
} from '@datadog/browser-rum/test/record/segments'
import { createMutationPayloadValidatorFromSegment } from '@datadog/browser-rum/test/record/mutationPayloadValidator'
import { test, expect } from '@playwright/test'
import { wait } from '@datadog/browser-core/test/wait'
import { createTest, html } from '../../lib/framework'

const UUID_RE = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/

test.describe('recorder', () => {
  createTest('record mouse move')
    .withRum()
    .run(async ({ intakeRegistry, flushEvents, page }) => {
      await page.evaluate(() => document.documentElement.outerHTML)
      await page.locator('html').click()
      await flushEvents()

      expect(intakeRegistry.replaySegments).toHaveLength(1)
      const {
        segment,
        metadata,
        segmentFile: { encoding, filename, mimetype },
      } = intakeRegistry.replayRequests[0]
      expect(metadata).toEqual({
        application: { id: expect.stringMatching(UUID_RE) },
        creation_reason: 'init',
        end: expect.any(Number),
        has_full_snapshot: true,
        records_count: expect.any(Number),
        session: { id: expect.stringMatching(UUID_RE) },
        start: expect.any(Number),
        view: { id: expect.stringMatching(UUID_RE) },
        raw_segment_size: expect.any(Number),
        compressed_segment_size: expect.any(Number),
        index_in_view: 0,
        source: 'browser',
      })
      expect(segment).toEqual({
        application: { id: metadata.application.id },
        creation_reason: metadata.creation_reason,
        end: Number(metadata.end),
        has_full_snapshot: true,
        records: expect.any(Array),
        records_count: Number(metadata.records_count),
        session: { id: metadata.session.id },
        start: Number(metadata.start),
        view: { id: metadata.view.id },
        index_in_view: 0,
        source: 'browser',
      })
      expect(encoding).toEqual(expect.any(String))
      expect(filename).toBe(`${metadata.session.id}-${metadata.start}`)
      expect(mimetype).toBe('application/octet-stream')

      expect(findMeta(segment), 'have a Meta record').toBeTruthy()
      expect(findFullSnapshot(segment), 'have a FullSnapshot record').toBeTruthy()
      expect(
        findIncrementalSnapshot(segment, IncrementalSource.MouseInteraction),
        'have a IncrementalSnapshot/MouseInteraction record'
      ).toBeTruthy()
    })

  test.describe('full snapshot', () => {
    test.describe('obfuscate elements', () => {
      const body = html`<div id="not-obfuscated">displayed</div>
        <p id="hidden-by-attribute" data-dd-privacy="hidden">hidden</p>
        <span id="hidden-by-classname" class="dd-privacy-hidden">hidden</span>
        <input id="input-not-obfuscated" value="displayed" />
        <input id="input-masked" data-dd-privacy="mask" value="masked" />`

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()

          expect(intakeRegistry.replaySegments).toHaveLength(1)

          const fullSnapshot = findFullSnapshotInFormat(SnapshotFormat.V1, intakeRegistry.replaySegments[0])!

          const node = findElementWithIdAttribute(fullSnapshot.data.node, 'not-obfuscated')
          expect(node).toBeTruthy()
          expect(findTextContent(node!)).toBe('displayed')

          const hiddenNodeByAttribute = findElement(fullSnapshot.data.node, (node) => node.tagName === 'p')
          expect(hiddenNodeByAttribute).toBeTruthy()
          expect(hiddenNodeByAttribute!.attributes['data-dd-privacy']).toBe('hidden')
          expect(hiddenNodeByAttribute!.childNodes).toHaveLength(0)

          const hiddenNodeByClassName = findElement(fullSnapshot.data.node, (node) => node.tagName === 'span')
          expect(hiddenNodeByClassName).toBeTruthy()
          expect(hiddenNodeByClassName!.attributes.class).toBeUndefined()
          expect(hiddenNodeByClassName!.attributes['data-dd-privacy']).toBe('hidden')
          expect(hiddenNodeByClassName!.childNodes).toHaveLength(0)

          const inputIgnored = findElementWithIdAttribute(fullSnapshot.data.node, 'input-not-obfuscated')
          expect(inputIgnored).toBeTruthy()
          expect(inputIgnored!.attributes.value).toBe('displayed')

          const inputMasked = findElementWithIdAttribute(fullSnapshot.data.node, 'input-masked')
          expect(inputMasked).toBeTruthy()
          expect(inputMasked!.attributes.value).toBe('***')
        })

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, flushEvents }) => {
          await flushEvents()
          expect(intakeRegistry.replaySegments).toHaveLength(1)

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(0)!.data).toEqual([
            [
              ChangeType.AddNode,
              [null, '#document'],
              [1, '#doctype', 'html', '', ''],
              [0, 'HTML'],
              [1, 'HEAD'],
              [0, 'BODY'],
              [1, 'DIV', ['id', 'not-obfuscated']],
              [1, '#text', 'displayed'],
              [3, '#text', '\n        '],
              [0, 'P', ['data-dd-privacy', 'hidden']],
              [0, '#text', '\n        '],
              [0, 'SPAN', ['data-dd-privacy', 'hidden']],
              [0, '#text', '\n        '],
              [0, 'INPUT', ['id', 'input-not-obfuscated'], ['value', 'displayed']],
              [0, '#text', '\n        '],
              [0, 'INPUT', ['id', 'input-masked'], ['data-dd-privacy', 'mask'], ['value', '***']],
            ],
            [
              ChangeType.Size,
              [8, expect.any(Number), expect.any(Number)],
              [10, expect.any(Number), expect.any(Number)],
            ],
            [ChangeType.ScrollPosition, [0, 0, 0]],
          ])
        })
    })
  })

  test.describe('mutations observer', () => {
    const body = html`
      <p>mutation observer</p>
      <ul>
        <li></li>
      </ul>
    `

    test.describe('record mutations', () => {
      const mutate = () => {
        const li = document.createElement('li')
        const ul = document.querySelector('ul') as HTMLUListElement

        // Make sure mutations occurring in a removed element are not reported
        ul.appendChild(li)
        document.body.removeChild(ul)

        const p = document.querySelector('p') as HTMLParagraphElement
        p.appendChild(document.createElement('span'))
      }

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidatorFromSegment(
            intakeRegistry.replaySegments[0],
            { expect }
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

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
            [ChangeType.AddNode, [8, 'SPAN']],
            [ChangeType.RemoveNode, 9],
          ])
        })
    })

    test.describe('record character data mutations', () => {
      const mutate = () => {
        const li = document.createElement('li')
        const ul = document.querySelector('ul') as HTMLUListElement

        // Make sure mutations occurring in a removed element are not reported
        ul.appendChild(li)
        li.innerText = 'new list item'
        li.innerText = 'new list item edit'
        document.body.removeChild(ul)

        const p = document.querySelector('p') as HTMLParagraphElement
        p.innerText = 'mutated'
      }

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const { validate, expectNewNode, expectInitialNode } = createMutationPayloadValidatorFromSegment(
            intakeRegistry.replaySegments[0],
            { expect }
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

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
            [ChangeType.AddNode, [8, '#text', 'mutated']],
            [ChangeType.RemoveNode, 9, 7],
          ])
        })
    })

    test.describe('record attributes mutations', () => {
      const mutate = () => {
        const li = document.createElement('li')
        const ul = document.querySelector('ul') as HTMLUListElement

        // Make sure mutations occurring in a removed element are not reported
        ul.appendChild(li)
        li.setAttribute('foo', 'bar')
        document.body.removeChild(ul)

        document.body.setAttribute('test', 'true')
      }

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const { validate, expectInitialNode } = createMutationPayloadValidatorFromSegment(
            intakeRegistry.replaySegments[0],
            { expect }
          )

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

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
            [ChangeType.RemoveNode, 9],
            [ChangeType.Attribute, [4, ['test', 'true']]],
          ])
        })
    })

    test.describe("don't record hidden elements mutations", () => {
      const hiddenBody = html`
        <div data-dd-privacy="hidden">
          <ul>
            <li></li>
          </ul>
        </div>
      `

      const mutate = () => {
        document.querySelector('div')!.setAttribute('foo', 'bar')
        document.querySelector('li')!.textContent = 'hop'
        document.querySelector('div')!.appendChild(document.createElement('p'))
      }

      createTest('V1')
        .withRum()
        .withBody(hiddenBody)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          expect(intakeRegistry.replaySegments).toHaveLength(1)
          const segment = intakeRegistry.replaySegments[0]
          expect(findAllIncrementalSnapshots(segment, IncrementalSource.Mutation)).toHaveLength(0)
        })

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(hiddenBody)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          expect(intakeRegistry.replaySegments).toHaveLength(1)
          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(records).toHaveLength(1)
          expect(records[0].type === RecordType.FullSnapshot)
        })
    })

    test.describe('record DOM node movement 1', () => {
      // prettier-ignore
      const body = html`
        <div>a<p></p>b</div>
        <span>c<i>d<b>e</b>f</i>g</span>
      `

      const mutate = () => {
        const div = document.querySelector('div')!
        const p = document.querySelector('p')!
        const span = document.querySelector('span')!
        document.body.removeChild(span)
        p.appendChild(span)
        p.removeChild(span)
        div.appendChild(span)
      }

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const { validate, expectInitialNode } = createMutationPayloadValidatorFromSegment(
            intakeRegistry.replaySegments[0],
            { expect }
          )
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

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
            [
              ChangeType.AddNode,
              [14, 'SPAN'],
              [1, '#text', 'c'],
              [0, 'I'],
              [1, '#text', 'd'],
              [0, 'B'],
              [1, '#text', 'e'],
              [4, '#text', 'f'],
              [7, '#text', 'g'],
            ],
            [ChangeType.RemoveNode, 11],
          ])
        })
    })

    test.describe('record DOM node movement 2', () => {
      // prettier-ignore
      const body = html`
        <span>c<i>d<b>e</b>f</i>g</span>
      `

      const mutate = () => {
        const div = document.createElement('div')
        const span = document.querySelector('span')!
        document.body.appendChild(div)
        div.appendChild(span)
      }

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidatorFromSegment(
            intakeRegistry.replaySegments[0],
            { expect }
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

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
            [
              ChangeType.AddNode,
              [11, 'DIV'],
              [1, 'SPAN'],
              [1, '#text', 'c'],
              [0, 'I'],
              [1, '#text', 'd'],
              [0, 'B'],
              [1, '#text', 'e'],
              [4, '#text', 'f'],
              [7, '#text', 'g'],
            ],
            [ChangeType.RemoveNode, 6],
          ])
        })
    })

    test.describe('serialize node before record', () => {
      // prettier-ignore
      const body = html`
        <ul><li></li></ul>
      `

      const mutate = () => {
        const ul = document.querySelector('ul') as HTMLUListElement
        let count = 3
        while (count > 0) {
          count--
          const li = document.createElement('li')
          ul.appendChild(li)
        }
      }

      createTest('V1')
        .withRum()
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const { validate, expectInitialNode, expectNewNode } = createMutationPayloadValidatorFromSegment(
            intakeRegistry.replaySegments[0],
            { expect }
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

      createTest('Change')
        .withRum({
          enableExperimentalFeatures: ['use_incremental_change_records'],
        })
        .withBody(body)
        .run(async ({ intakeRegistry, page, flushEvents }) => {
          await page.evaluate(mutate)
          await flushEvents()

          const records = findChangeRecords(intakeRegistry.replaySegments[0].records)
          expect(decodeChangeRecords(records).at(-1)!.data).toEqual([
            [ChangeType.AddNode, [3, 'LI'], [4, 'LI'], [5, 'LI']],
          ])
        })
    })
  })

  test.describe('input observers', () => {
    test.describe('record input interactions', () => {
      function createTestVariation(name: string, enableExperimentalFeatures: string[]): void {
        createTest(name)
          .withRum({
            defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
            enableExperimentalFeatures,
          })
          .withBody(html`
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
          `)
          .run(async ({ intakeRegistry, page, flushEvents }) => {
            const textInput = page.locator('#text-input')
            await textInput.pressSequentially('test')

            const radioInput = page.locator('#radio-input')
            await radioInput.click()

            const checkboxInput = page.locator('#checkbox-input')
            await checkboxInput.click()

            const textarea = page.locator('#textarea')
            await textarea.pressSequentially('textarea test')

            const select = page.locator('#select')
            await select.selectOption({ value: '2' })

            await flushEvents()

            const fullSnapshot = findFullSnapshot({ records: intakeRegistry.replayRecords })!
            const elementIds = getElementIdsFromFullSnapshot(fullSnapshot)

            const textInputRecords = filterRecordsByIdAttribute('text-input')
            expect(textInputRecords.length).toBeGreaterThanOrEqual(4)
            expect((textInputRecords[textInputRecords.length - 1].data as { text?: string }).text).toBe('test')

            const radioInputRecords = filterRecordsByIdAttribute('radio-input')
            expect(radioInputRecords).toHaveLength(1)
            expect((radioInputRecords[0].data as { text?: string }).text).toBe(undefined)
            expect((radioInputRecords[0].data as { isChecked?: boolean }).isChecked).toBe(true)

            const checkboxInputRecords = filterRecordsByIdAttribute('checkbox-input')
            expect(checkboxInputRecords).toHaveLength(1)
            expect((checkboxInputRecords[0].data as { text?: string }).text).toBe(undefined)
            expect((checkboxInputRecords[0].data as { isChecked?: boolean }).isChecked).toBe(true)

            const textareaRecords = filterRecordsByIdAttribute('textarea')
            expect(textareaRecords.length).toBeGreaterThanOrEqual(4)
            expect((textareaRecords[textareaRecords.length - 1].data as { text?: string }).text).toBe('textarea test')

            const selectRecords = filterRecordsByIdAttribute('select')
            expect(selectRecords).toHaveLength(1)
            expect((selectRecords[0].data as { text?: string }).text).toBe('2')

            function filterRecordsByIdAttribute(idAttribute: string) {
              const id = elementIds.get(idAttribute)
              const records = findAllIncrementalSnapshots(
                { records: intakeRegistry.replayRecords },
                IncrementalSource.Input
              ) as Array<{ data: InputData }>
              return records.filter((record) => record.data.id === id)
            }
          })
      }

      createTestVariation('V1', [])
      createTestVariation('Change', ['use_incremental_change_records'])
    })

    createTest("don't record ignored input interactions")
      .withRum({
        defaultPrivacyLevel: DefaultPrivacyLevel.ALLOW,
      })
      .withBody(html`
        <input type="text" id="first" name="first" />
        <input type="text" id="second" name="second" data-dd-privacy="input-ignored" />
        <input type="text" id="third" name="third" class="dd-privacy-input-ignored" />
        <input type="password" id="fourth" name="fourth" />
      `)
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const firstInput = page.locator('#first')
        await firstInput.fill('foo')

        const secondInput = page.locator('#second')
        await secondInput.fill('bar')

        const thirdInput = page.locator('#third')
        await thirdInput.fill('baz')

        const fourthInput = page.locator('#fourth')
        await fourthInput.fill('quux')

        await flushEvents()

        const inputRecords = findAllIncrementalSnapshots(
          { records: intakeRegistry.replayRecords },
          IncrementalSource.Input
        )

        expect(inputRecords.length).toBeGreaterThanOrEqual(3) // 4 on Safari, 3 on others
        expect((inputRecords[inputRecords.length - 1].data as { text?: string }).text).toBe('***')
      })

    createTest('replace masked values by asterisks')
      .withRum()
      .withBody(html`
        <input type="text" id="by-data-attribute" data-dd-privacy="mask" />
        <input type="text" id="by-classname" class="dd-privacy-mask" />
      `)
      .run(async ({ intakeRegistry, flushEvents, page }) => {
        const firstInput = page.locator('#by-data-attribute')
        await firstInput.fill('foo')

        const secondInput = page.locator('#by-classname')
        await secondInput.fill('bar')

        await flushEvents()

        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const segment = intakeRegistry.replaySegments[0]

        const inputRecords = findAllIncrementalSnapshots(segment, IncrementalSource.Input)

        expect(inputRecords.length).toBeGreaterThan(0)

        expect(inputRecords.every((inputRecord) => /^\**$/.test((inputRecord.data as { text: string }).text))).toBe(
          true
        )
      })
  })

  test.describe('stylesheet rules observer', () => {
    createTest('record dynamic CSS changes')
      .withRum()
      .withBody(html`
        <style>
          .foo {
          }
          .bar {
          }
        </style>
      `)
      .run(async ({ intakeRegistry, page, flushEvents }) => {
        await page.evaluate(() => {
          document.styleSheets[0].deleteRule(0)
          document.styleSheets[0].insertRule('.added {}', 0)
        })

        await flushEvents()

        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const segment = intakeRegistry.replaySegments[0]

        const styleSheetRules = findAllIncrementalSnapshots(segment, IncrementalSource.StyleSheetRule) as Array<{
          data: StyleSheetRuleData
        }>

        expect(styleSheetRules).toHaveLength(2)
        expect(styleSheetRules[0].data.removes).toEqual([{ index: 0 }])
        expect(styleSheetRules[1].data.adds).toEqual([{ rule: '.added {}', index: 0 }])
      })

    createTest('record nested css rules changes')
      .withRum()
      .withBody(html`
        <style>
          @supports (display: grid) {
            .foo {
            }
          }
          @media condition {
            .bar {
            }
            .baz {
            }
          }
        </style>
      `)
      .run(async ({ intakeRegistry, page, flushEvents }) => {
        await page.evaluate(() => {
          const supportsRule = document.styleSheets[0].cssRules[0] as CSSGroupingRule
          const mediaRule = document.styleSheets[0].cssRules[1] as CSSGroupingRule

          supportsRule.insertRule('.inserted {}', 0)
          supportsRule.insertRule('.added {}', 1)
          mediaRule.deleteRule(1)
        })

        await flushEvents()

        expect(intakeRegistry.replaySegments).toHaveLength(1)

        const segment = intakeRegistry.replaySegments[0]

        const styleSheetRules = findAllIncrementalSnapshots(segment, IncrementalSource.StyleSheetRule) as Array<{
          data: StyleSheetRuleData
        }>

        expect(styleSheetRules).toHaveLength(3)
        expect(styleSheetRules[0].data.adds).toEqual([{ rule: '.inserted {}', index: [0, 0] }])
        expect(styleSheetRules[1].data.adds).toEqual([{ rule: '.added {}', index: [0, 1] }])
        expect(styleSheetRules[2].data.removes).toEqual([{ index: [1, 1] }])
      })
  })

  test.describe('scroll positions', () => {
    test.describe('should be recorded across view changes', () => {
      function createTestVariation(name: string, enableExperimentalFeatures: string[]): void {
        createTest(name)
          .withRum({
            enableExperimentalFeatures,
            // to control initial position before recording
            startSessionReplayRecordingManually: true,
          })
          .withBody(html`
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
          `)
          .run(async ({ intakeRegistry, page, flushEvents }) => {
            function scroll({ windowY, containerX }: { windowY: number; containerX: number }) {
              return page.evaluate(
                ({ windowY, containerX }) =>
                  new Promise<void>((resolve) => {
                    let scrollCount = 0

                    document.addEventListener(
                      'scroll',
                      () => {
                        scrollCount++
                        if (scrollCount === 2) {
                          // ensure to bypass observer throttling
                          setTimeout(resolve, 100)
                        }
                      },
                      { capture: true, passive: true }
                    )

                    window.scrollTo(0, windowY)
                    document.getElementById('container')!.scrollTo(containerX, 0)
                  }),
                { windowY, containerX }
              )
            }

            await page.evaluate(() => {
              document.getElementsByTagName('html')[0].setAttribute('id', 'html')
            })

            // initial scroll positions
            await scroll({ windowY: 100, containerX: 10 })

            await page.evaluate(() => {
              window.DD_RUM!.startSessionReplayRecording()
            })

            // wait for recorder to be properly started
            await wait(100)

            // update scroll positions
            await scroll({ windowY: 150, containerX: 20 })

            // trigger new full snapshot
            await page.evaluate(() => {
              window.DD_RUM!.startView()
            })

            await flushEvents()

            expect(intakeRegistry.replaySegments).toHaveLength(2)
            const firstSegment = intakeRegistry.replaySegments[0]

            {
              const firstFullSnapshot = findFullSnapshot(firstSegment)!
              const elementIds = getElementIdsFromFullSnapshot(firstFullSnapshot)
              const scrollPositions = getScrollPositionsFromFullSnapshot(firstFullSnapshot)

              const htmlId = elementIds.get('html')
              expect(htmlId).not.toBeUndefined()
              expect(scrollPositions.get(htmlId!)).toEqual({ left: 0, top: 100 })

              const containerId = elementIds.get('container')
              expect(containerId).not.toBeUndefined()
              expect(scrollPositions.get(containerId!)).toEqual({ left: 10, top: 0 })

              const scrollRecords = findAllIncrementalSnapshots(firstSegment, IncrementalSource.Scroll)
              expect(scrollRecords).toHaveLength(2)
              const [windowScrollData, containerScrollData] = scrollRecords.map((record) => record.data as ScrollData)
              expect(windowScrollData.y).toEqual(150)
              expect(containerScrollData.x).toEqual(20)
            }

            {
              const secondFullSnapshot = findFullSnapshot(intakeRegistry.replaySegments.at(-1)!)!
              const elementIds = getElementIdsFromFullSnapshot(secondFullSnapshot)
              const scrollPositions = getScrollPositionsFromFullSnapshot(secondFullSnapshot)

              const htmlId = elementIds.get('html')
              expect(htmlId).not.toBeUndefined()
              expect(scrollPositions.get(htmlId!)).toEqual({ left: 0, top: 150 })

              const containerId = elementIds.get('container')
              expect(containerId).not.toBeUndefined()
              expect(scrollPositions.get(containerId!)).toEqual({ left: 20, top: 0 })
            }
          })
      }

      createTestVariation('V1', [])
      createTestVariation('Change', ['use_incremental_change_records'])
    })
  })

  test.describe('recording of sampled out sessions', () => {
    createTest('should not start recording when session is sampled out')
      .withRum({ sessionReplaySampleRate: 0 })
      .run(async ({ intakeRegistry, page, flushEvents }) => {
        await page.evaluate(() => {
          window.DD_RUM!.startSessionReplayRecording()
        })

        await flushEvents()

        expect(intakeRegistry.replaySegments).toHaveLength(0)
      })

    createTest('should start recording if forced when session is sampled out')
      .withRum({ sessionReplaySampleRate: 0 })
      .run(async ({ intakeRegistry, page, flushEvents, browserContext }) => {
        await page.evaluate(() => {
          window.DD_RUM!.startSessionReplayRecording({ force: true })
        })
        const [cookie] = await browserContext.cookies()
        expect(cookie.value).toContain('forcedReplay=1')

        await flushEvents()

        expect(intakeRegistry.replaySegments).toHaveLength(1)
      })
  })

  createTest('restarting recording should send a new full snapshot')
    .withRum()
    .run(async ({ intakeRegistry, page, flushEvents }) => {
      await page.evaluate(() => {
        window.DD_RUM!.stopSessionReplayRecording()
        window.DD_RUM!.startSessionReplayRecording()
      })

      await flushEvents()

      expect(intakeRegistry.replaySegments).toHaveLength(2)

      const firstSegment = intakeRegistry.replaySegments[0]
      expect(findFullSnapshot(firstSegment), 'first segment have a FullSnapshot record').toBeTruthy()

      const secondSegment = intakeRegistry.replaySegments[1]
      expect(findFullSnapshot(secondSegment), 'second segment have a FullSnapshot record').toBeTruthy()
    })

  createTest('workerUrl initialization parameter')
    .withRum({ workerUrl: '/worker.js' })
    .withBasePath('/no-blob-worker-csp')
    .run(async ({ intakeRegistry, flushEvents }) => {
      await flushEvents()

      expect(intakeRegistry.replaySegments).toHaveLength(1)
    })
})
