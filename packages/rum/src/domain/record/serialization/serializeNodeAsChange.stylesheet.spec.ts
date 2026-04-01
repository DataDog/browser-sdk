import { isAdoptedStyleSheetsSupported } from 'packages/core/test'
import { ChangeType } from '../../../types'
import type { RecordingScope } from '../recordingScope'
import type { SerializationStats } from './serializationStats'

import { serializeHtmlAsChange } from './serializeHtml.specHelper'

describe('serializeNodeAsChange for stylesheets', () => {
  const css = 'div { color: green; }'
  const dynamicCss = 'span { color: red; }'

  describe('for <style> elements', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange('<style id="foo"></style>', {
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 0, max: 0, sum: 0 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'STYLE', ['id', 'foo']]]])
    })

    it('serializes multiple elements and aggregates their statistics', async () => {
      const record = await serializeHtmlAsChange(
        `
        <div>
          <style id="foo">${css}</style>
          <style id="bar">${css}</style>
        </div>
        `,
        {
          after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
            expect(stats).toEqual({
              cssText: { count: 2, max: 21, sum: 42 },
              serializationDuration: jasmine.anything(),
            })
          },
        }
      )
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'DIV'], [1, 'STYLE', ['id', 'foo']], [0, 'STYLE', ['id', 'bar']]],
        [ChangeType.AddStyleSheet, ['div { color: green; }'], ['div { color: green; }']],
        [ChangeType.AttachedStyleSheets, [1, 0], [2, 1]],
      ])
    })

    it('serializes the contents of the associated stylesheet', async () => {
      const record = await serializeHtmlAsChange(`<style>${css}</style>`, {
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 21, sum: 21 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [css]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes dynamically inserted CSS rules', async () => {
      const record = await serializeHtmlAsChange('<style></style>', {
        before(target: Node): void {
          ;(target as HTMLStyleElement).sheet!.insertRule(dynamicCss)
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 20, sum: 20 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [dynamicCss]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes a mix of static and dynamic CSS rules', async () => {
      const record = await serializeHtmlAsChange(`<style>${css}</style>`, {
        before(target: Node): void {
          ;(target as HTMLStyleElement).sheet!.insertRule(dynamicCss)
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 41, sum: 41 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [`${dynamicCss}${css}`]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes dynamically modified CSS rules', async () => {
      const record = await serializeHtmlAsChange(`<style>${css}</style>`, {
        before(target: Node): void {
          const sheet = (target as HTMLStyleElement).sheet!
          const rule = sheet.cssRules[0] as CSSStyleRule
          rule.selectorText = 'span'
          rule.style.color = 'red'
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 20, sum: 20 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'STYLE']],
        [ChangeType.AddStyleSheet, [dynamicCss]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })
  })

  describe('for <style> element children', () => {
    it('does not serialize them', async () => {
      const record = await serializeHtmlAsChange(`<style>${css}</style>`, { target: (node: Node) => node.firstChild! })
      expect(record).toBeUndefined()
    })
  })

  describe('for <link rel="stylesheet"> elements', () => {
    const sheet = {
      href: 'https://datadoghq.invalid/some/style.css',
      cssRules: [{ cssText: css }],
    }

    it('serializes the element when the sheet is accessible', async () => {
      const record = await serializeHtmlAsChange(`<link rel="stylesheet" href="${sheet.href}">`, {
        before(target: Node): void {
          // Simulate a successful fetch of the stylesheet. (In reality, the fetch will
          // fail, so `target.sheet` won't be populated by the browser.)
          Object.defineProperty(target.ownerDocument, 'styleSheets', {
            value: [sheet],
            configurable: true,
          })
          Object.defineProperty(target, 'sheet', {
            value: sheet,
            configurable: true,
          })
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 1, max: 21, sum: 21 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'LINK', ['rel', 'stylesheet'], ['href', sheet.href]]],
        [ChangeType.AddStyleSheet, [css]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })

    it('serializes the element when the sheet is unavailable', async () => {
      const record = await serializeHtmlAsChange(`<link rel="stylesheet" href="${sheet.href}">`, {
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 0, max: 0, sum: 0 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'LINK', ['rel', 'stylesheet'], ['href', sheet.href]]]])
    })

    it('serializes the element when the sheet is unreadable due to CORS', async () => {
      const unreadableSheet = { ...sheet }
      Object.defineProperty(unreadableSheet, 'cssRules', {
        get() {
          throw new Error('SecurityError')
        },
      })

      const record = await serializeHtmlAsChange(`<link rel="stylesheet" href="${sheet.href}">`, {
        before(target: Node): void {
          // Simulate a successful fetch of the stylesheet which is unreadable due to CORS.
          Object.defineProperty(target.ownerDocument, 'styleSheets', {
            value: [unreadableSheet],
            configurable: true,
          })
          Object.defineProperty(target, 'sheet', {
            value: unreadableSheet,
            configurable: true,
          })
        },
        after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
          expect(stats).toEqual({
            cssText: { count: 0, max: 0, sum: 0 },
            serializationDuration: jasmine.anything(),
          })
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'LINK', ['rel', 'stylesheet'], ['href', unreadableSheet.href]]],
      ])
    })
  })

  describe('for documents with adopted stylesheets', () => {
    it('serializes the stylesheet', async () => {
      if (!isAdoptedStyleSheetsSupported()) {
        pending('No adoptedStyleSheets support.')
      }

      const record = await serializeHtmlAsChange(
        `
        <!doctype HTML>
        <div></div>
        `,
        {
          input: 'document',
          before(target: Node): void {
            const document = target as Document
            const window = document.defaultView!
            const sheet = new window.CSSStyleSheet()
            sheet.insertRule(css)
            document.adoptedStyleSheets = [sheet]
          },
          after(_target: Node, _scope: RecordingScope, stats: SerializationStats): void {
            expect(stats).toEqual({
              cssText: { count: 1, max: 21, sum: 21 },
              serializationDuration: jasmine.anything(),
            })
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, '#document'],
          [1, '#doctype', 'html', '', ''],
          [0, 'HTML'],
          [1, 'HEAD'],
          [0, 'BODY'],
          [1, 'DIV'],
        ],
        [ChangeType.ScrollPosition, [0, 0, 0]],
        [ChangeType.AddStyleSheet, [[css]]],
        [ChangeType.AttachedStyleSheets, [0, 0]],
      ])
    })
  })
})
