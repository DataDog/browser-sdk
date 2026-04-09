import type { BrowserWindow } from '@datadog/browser-rum-core'
import {
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '@datadog/browser-rum-core'
import { registerCleanupTask } from 'packages/core/test'
import { ChangeType, PlaybackState } from '../../../types'

import { serializeHtmlAsChange } from './serializeHtml.specHelper'

describe('serializeNodeAsChange for snapshotted documents', () => {
  describe('for a simple document', () => {
    const GREEN_PNG =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQAQMAAAAlPW0iAAAAA1BMVEUA/wA0XsCoAAAADElEQVR4nGNgIA0AAAAwAAEWiZrRAAAAAElFTkSuQmCC'

    function createHtmlWithPrivacyAttributeValue(privacyAttributeValue: string): string {
      return `
        <!doctype HTML>
        <html ${PRIVACY_ATTR_NAME}="${privacyAttributeValue}" style="width: 100%; height: 100%;">
          <head>
              <link href="https://public.com/path/nested?query=param#hash" rel="stylesheet">
              <style>
                .example {color: red;}
              </style>
              <script>private</script>
              <meta>
              <base>
              <title>private title</title>
          </head>
          <body>
              <h1>hello private world</h1>
              <p>Loreum ipsum private text</p>
              <noscript>hello private world</noscript>
              <a href="https://private.com/path/nested?query=param#hash">
                Click https://private.com/path/nested?query=param#hash
              </a>
              <img src="${GREEN_PNG}">
              <video controls>
                <source src="https://private.com/path/nested?query=param#hash" type="video/webm">
                <source src="https://private.com/path/nested?query=param#hash" type="video/mp4">
                <p>Your browser cannot play the provided video file.</p>
              </video>
              <select>
                <option aria-label="A">private option A</option>
                <option aria-label="B">private option B</option>
                <option aria-label="C">private option C</option>
              </select>
              <input type="password">
              <input type="text">
              <input type="checkbox" id="inputFoo" name="inputFoo" checked>
              <label for="inputFoo">inputFoo label</label>

              <input type="radio" id="bar-private" name="radioGroup" value="bar-private">

              <textarea id="baz" name="baz" rows="2" cols="20">
                Loreum Ipsum private ...
              </textarea>

              <div contentEditable>editable private div</div>
          </body>
        </html>
      `
    }

    describe("when the <html> element's privacy level is ALLOW", () => {
      it('matches the snapshot', async () => {
        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_ALLOW)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [0, 'HTML', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_ALLOW], ['style', 'width: 100%; height: 100%;']],
            [1, 'HEAD'],
            [1, 'LINK', ['href', 'https://public.com/path/nested?query=param#hash'], ['rel', 'stylesheet']],
            [0, 'STYLE'],
            [0, 'META'],
            [0, 'BASE'],
            [0, 'TITLE'],
            [1, '#text', 'private title'],
            [8, 'BODY'],
            [1, 'H1'],
            [1, '#text', 'hello private world'],
            [3, 'P'],
            [1, '#text', 'Loreum ipsum private text'],
            [5, 'NOSCRIPT'],
            [1, '#text', 'hello private world'],
            [7, 'A', ['href', 'https://private.com/path/nested?query=param#hash']],
            [1, '#text', '\n                Click https://private.com/path/nested?query=param#hash\n              '],
            [9, 'IMG', ['src', GREEN_PNG]],
            [0, 'VIDEO', ['controls', '']],
            [1, 'SOURCE', ['src', 'https://private.com/path/nested?query=param#hash'], ['type', 'video/webm']],
            [0, 'SOURCE', ['src', 'https://private.com/path/nested?query=param#hash'], ['type', 'video/mp4']],
            [0, 'P'],
            [1, '#text', 'Your browser cannot play the provided video file.'],
            [15, 'SELECT', ['value', 'private option A']],
            [1, 'OPTION', ['aria-label', 'A'], ['value', 'private option A'], ['selected', '']],
            [1, '#text', 'private option A'],
            [3, 'OPTION', ['aria-label', 'B'], ['value', 'private option B']],
            [1, '#text', 'private option B'],
            [5, 'OPTION', ['aria-label', 'C'], ['value', 'private option C']],
            [1, '#text', 'private option C'],
            [22, 'INPUT', ['type', 'password']],
            [0, 'INPUT', ['type', 'text']],
            [
              0,
              'INPUT',
              ['type', 'checkbox'],
              ['id', 'inputFoo'],
              ['name', 'inputFoo'],
              ['checked', ''],
              ['value', 'on'],
            ],
            [0, 'LABEL', ['for', 'inputFoo']],
            [1, '#text', 'inputFoo label'],
            [27, 'INPUT', ['type', 'radio'], ['id', 'bar-private'], ['name', 'radioGroup'], ['value', 'bar-private']],
            [
              0,
              'TEXTAREA',
              ['id', 'baz'],
              ['name', 'baz'],
              ['rows', '2'],
              ['cols', '20'],
              ['value', '                Loreum Ipsum private ...\n              '],
            ],
            [1, '#text', '                Loreum Ipsum private ...\n              '],
            [30, 'DIV', ['contenteditable', '']],
            [1, '#text', 'editable private div'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, ['.example { color: red; }']],
          [ChangeType.AttachedStyleSheets, [5, 0]],
          [ChangeType.MediaPlaybackState, [20, PlaybackState.Paused]],
        ])
      })
    })

    describe("when the <html> element's privacy level is HIDDEN", () => {
      it('matches the snapshot', async () => {
        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_HIDDEN)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [0, 'HTML', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_HIDDEN]],
          ],
          [ChangeType.Size, [2, jasmine.any(Number), jasmine.any(Number)]],
          [ChangeType.ScrollPosition, [0, 0, 0]],
        ])
      })
    })

    describe("when the <html> element's privacy level is MASK", () => {
      it('matches the snapshot', async () => {
        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_MASK)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [0, 'HTML', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK], ['style', 'width: 100%; height: 100%;']],
            [1, 'HEAD'],
            [1, 'LINK', ['href', 'https://public.com/path/nested?query=param#hash'], ['rel', 'stylesheet']],
            [0, 'STYLE'],
            [0, 'META'],
            [0, 'BASE'],
            [0, 'TITLE'],
            [1, '#text', 'xxxxxxx xxxxx'],
            [8, 'BODY'],
            [1, 'H1'],
            [1, '#text', 'xxxxx xxxxxxx xxxxx'],
            [3, 'P'],
            [1, '#text', 'xxxxxx xxxxx xxxxxxx xxxx'],
            [5, 'NOSCRIPT'],
            [1, '#text', 'xxxxx xxxxxxx xxxxx'],
            [7, 'A', ['href', '***']],
            [1, '#text', '\n                xxxxx xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n              '],
            [
              9,
              'IMG',
              [
                'src',
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' style='background-color:silver'%3E%3C/svg%3E",
              ],
            ],
            [0, 'VIDEO', ['controls', '']],
            [
              1,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/webm'],
            ],
            [
              0,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/mp4'],
            ],
            [0, 'P'],
            [1, '#text', 'xxxx xxxxxxx xxxxxx xxxx xxx xxxxxxxx xxxxx xxxxx'],
            [15, 'SELECT', ['value', '***']],
            [1, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [3, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [5, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [22, 'INPUT', ['type', 'password']],
            [0, 'INPUT', ['type', 'text']],
            [0, 'INPUT', ['type', 'checkbox'], ['id', 'inputFoo'], ['name', '***'], ['value', '***']],
            [0, 'LABEL', ['for', 'inputFoo']],
            [1, '#text', 'xxxxxxxx xxxxx'],
            [27, 'INPUT', ['type', 'radio'], ['id', 'bar-private'], ['name', '***'], ['value', '***']],
            [0, 'TEXTAREA', ['id', 'baz'], ['name', '***'], ['rows', '2'], ['cols', '20'], ['value', '***']],
            [1, '#text', '                xxxxxx xxxxx xxxxxxx xxx\n              '],
            [30, 'DIV', ['contenteditable', '']],
            [1, '#text', 'xxxxxxxx xxxxxxx xxx'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, ['.example { color: red; }']],
          [ChangeType.AttachedStyleSheets, [5, 0]],
          [ChangeType.MediaPlaybackState, [20, PlaybackState.Paused]],
        ])
      })
    })

    describe("when the <html> element's privacy level is MASK_USER_INPUT", () => {
      it('matches the snapshot', async () => {
        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_MASK_USER_INPUT)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [
              0,
              'HTML',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['style', 'width: 100%; height: 100%;'],
            ],
            [1, 'HEAD'],
            [1, 'LINK', ['href', 'https://public.com/path/nested?query=param#hash'], ['rel', 'stylesheet']],
            [0, 'STYLE'],
            [0, 'META'],
            [0, 'BASE'],
            [0, 'TITLE'],
            [1, '#text', 'private title'],
            [8, 'BODY'],
            [1, 'H1'],
            [1, '#text', 'hello private world'],
            [3, 'P'],
            [1, '#text', 'Loreum ipsum private text'],
            [5, 'NOSCRIPT'],
            [1, '#text', 'hello private world'],
            [7, 'A', ['href', 'https://private.com/path/nested?query=param#hash']],
            [1, '#text', '\n                Click https://private.com/path/nested?query=param#hash\n              '],
            [9, 'IMG', ['src', GREEN_PNG]],
            [0, 'VIDEO', ['controls', '']],
            [1, 'SOURCE', ['src', 'https://private.com/path/nested?query=param#hash'], ['type', 'video/webm']],
            [0, 'SOURCE', ['src', 'https://private.com/path/nested?query=param#hash'], ['type', 'video/mp4']],
            [0, 'P'],
            [1, '#text', 'Your browser cannot play the provided video file.'],
            [15, 'SELECT', ['value', '***']],
            [1, 'OPTION', ['aria-label', 'A']],
            [1, '#text', '***'],
            [3, 'OPTION', ['aria-label', 'B']],
            [1, '#text', '***'],
            [5, 'OPTION', ['aria-label', 'C']],
            [1, '#text', '***'],
            [22, 'INPUT', ['type', 'password']],
            [0, 'INPUT', ['type', 'text']],
            [0, 'INPUT', ['type', 'checkbox'], ['id', 'inputFoo'], ['name', 'inputFoo'], ['value', '***']],
            [0, 'LABEL', ['for', 'inputFoo']],
            [1, '#text', 'inputFoo label'],
            [27, 'INPUT', ['type', 'radio'], ['id', 'bar-private'], ['name', 'radioGroup'], ['value', '***']],
            [0, 'TEXTAREA', ['id', 'baz'], ['name', 'baz'], ['rows', '2'], ['cols', '20'], ['value', '***']],
            [1, '#text', '                xxxxxx xxxxx xxxxxxx xxx\n              '],
            [30, 'DIV', ['contenteditable', '']],
            [1, '#text', 'editable private div'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, ['.example { color: red; }']],
          [ChangeType.AttachedStyleSheets, [5, 0]],
          [ChangeType.MediaPlaybackState, [20, PlaybackState.Paused]],
        ])
      })
    })

    describe("when the <html> element's privacy level is MASK_UNLESS_ALLOWLISTED", () => {
      it('matches the snapshot when the allowlist is populated', async () => {
        ;(window as BrowserWindow).$DD_ALLOW = new Set(['private title', 'hello private world'])
        registerCleanupTask(() => {
          delete (window as BrowserWindow).$DD_ALLOW
        })

        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [
              0,
              'HTML',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED],
              ['style', 'width: 100%; height: 100%;'],
            ],
            [1, 'HEAD'],
            [1, 'LINK', ['href', 'https://public.com/path/nested?query=param#hash'], ['rel', 'stylesheet']],
            [0, 'STYLE'],
            [0, 'META'],
            [0, 'BASE'],
            [0, 'TITLE'],
            [1, '#text', 'private title'], // Unmasked because this string appears in the allowlist.
            [8, 'BODY'],
            [1, 'H1'],
            [1, '#text', 'hello private world'], // Unmasked because this string appears in the allowlist.
            [3, 'P'],
            [1, '#text', 'xxxxxx xxxxx xxxxxxx xxxx'],
            [5, 'NOSCRIPT'],
            [1, '#text', 'hello private world'], // Unmasked because this string appears in the allowlist.
            [7, 'A', ['href', '***']],
            [1, '#text', '\n                xxxxx xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n              '],
            [
              9,
              'IMG',
              [
                'src',
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' style='background-color:silver'%3E%3C/svg%3E",
              ],
            ],
            [0, 'VIDEO', ['controls', '']],
            [
              1,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/webm'],
            ],
            [
              0,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/mp4'],
            ],
            [0, 'P'],
            [1, '#text', 'xxxx xxxxxxx xxxxxx xxxx xxx xxxxxxxx xxxxx xxxxx'],
            [15, 'SELECT', ['value', '***']],
            [1, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [3, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [5, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [22, 'INPUT', ['type', 'password']],
            [0, 'INPUT', ['type', 'text']],
            [0, 'INPUT', ['type', 'checkbox'], ['id', 'inputFoo'], ['name', '***'], ['value', '***']],
            [0, 'LABEL', ['for', 'inputFoo']],
            [1, '#text', 'xxxxxxxx xxxxx'],
            [27, 'INPUT', ['type', 'radio'], ['id', 'bar-private'], ['name', '***'], ['value', '***']],
            [0, 'TEXTAREA', ['id', 'baz'], ['name', '***'], ['rows', '2'], ['cols', '20'], ['value', '***']],
            [1, '#text', '                xxxxxx xxxxx xxxxxxx xxx\n              '],
            [30, 'DIV', ['contenteditable', '']],
            [1, '#text', 'xxxxxxxx xxxxxxx xxx'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, ['.example { color: red; }']],
          [ChangeType.AttachedStyleSheets, [5, 0]],
          [ChangeType.MediaPlaybackState, [20, PlaybackState.Paused]],
        ])
      })

      it('matches the snapshot when the allowlist is empty', async () => {
        ;(window as BrowserWindow).$DD_ALLOW = new Set()
        registerCleanupTask(() => {
          delete (window as BrowserWindow).$DD_ALLOW
        })

        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [
              0,
              'HTML',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED],
              ['style', 'width: 100%; height: 100%;'],
            ],
            [1, 'HEAD'],
            [1, 'LINK', ['href', 'https://public.com/path/nested?query=param#hash'], ['rel', 'stylesheet']],
            [0, 'STYLE'],
            [0, 'META'],
            [0, 'BASE'],
            [0, 'TITLE'],
            [1, '#text', 'xxxxxxx xxxxx'], // Masked because this string does not appear in the allowlist.
            [8, 'BODY'],
            [1, 'H1'],
            [1, '#text', 'xxxxx xxxxxxx xxxxx'], // Masked because this string does not appear in the allowlist.
            [3, 'P'],
            [1, '#text', 'xxxxxx xxxxx xxxxxxx xxxx'],
            [5, 'NOSCRIPT'],
            [1, '#text', 'xxxxx xxxxxxx xxxxx'], // Masked because this string does not appear in the allowlist.
            [7, 'A', ['href', '***']],
            [1, '#text', '\n                xxxxx xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n              '],
            [
              9,
              'IMG',
              [
                'src',
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' style='background-color:silver'%3E%3C/svg%3E",
              ],
            ],
            [0, 'VIDEO', ['controls', '']],
            [
              1,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/webm'],
            ],
            [
              0,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/mp4'],
            ],
            [0, 'P'],
            [1, '#text', 'xxxx xxxxxxx xxxxxx xxxx xxx xxxxxxxx xxxxx xxxxx'],
            [15, 'SELECT', ['value', '***']],
            [1, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [3, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [5, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [22, 'INPUT', ['type', 'password']],
            [0, 'INPUT', ['type', 'text']],
            [0, 'INPUT', ['type', 'checkbox'], ['id', 'inputFoo'], ['name', '***'], ['value', '***']],
            [0, 'LABEL', ['for', 'inputFoo']],
            [1, '#text', 'xxxxxxxx xxxxx'],
            [27, 'INPUT', ['type', 'radio'], ['id', 'bar-private'], ['name', '***'], ['value', '***']],
            [0, 'TEXTAREA', ['id', 'baz'], ['name', '***'], ['rows', '2'], ['cols', '20'], ['value', '***']],
            [1, '#text', '                xxxxxx xxxxx xxxxxxx xxx\n              '],
            [30, 'DIV', ['contenteditable', '']],
            [1, '#text', 'xxxxxxxx xxxxxxx xxx'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, ['.example { color: red; }']],
          [ChangeType.AttachedStyleSheets, [5, 0]],
          [ChangeType.MediaPlaybackState, [20, PlaybackState.Paused]],
        ])
      })

      it('matches the snapshot when the allowlist is not defined', async () => {
        const html = createHtmlWithPrivacyAttributeValue(PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED)
        const record = await serializeHtmlAsChange(html, { input: 'document' })
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [null, '#document'],
            [1, '#doctype', 'html', '', ''],
            [
              0,
              'HTML',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED],
              ['style', 'width: 100%; height: 100%;'],
            ],
            [1, 'HEAD'],
            [1, 'LINK', ['href', 'https://public.com/path/nested?query=param#hash'], ['rel', 'stylesheet']],
            [0, 'STYLE'],
            [0, 'META'],
            [0, 'BASE'],
            [0, 'TITLE'],
            [1, '#text', 'xxxxxxx xxxxx'], // Masked because this string does not appear in the allowlist.
            [8, 'BODY'],
            [1, 'H1'],
            [1, '#text', 'xxxxx xxxxxxx xxxxx'], // Masked because this string does not appear in the allowlist.
            [3, 'P'],
            [1, '#text', 'xxxxxx xxxxx xxxxxxx xxxx'],
            [5, 'NOSCRIPT'],
            [1, '#text', 'xxxxx xxxxxxx xxxxx'], // Masked because this string does not appear in the allowlist.
            [7, 'A', ['href', '***']],
            [1, '#text', '\n                xxxxx xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\n              '],
            [
              9,
              'IMG',
              [
                'src',
                "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' style='background-color:silver'%3E%3C/svg%3E",
              ],
            ],
            [0, 'VIDEO', ['controls', '']],
            [
              1,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/webm'],
            ],
            [
              0,
              'SOURCE',
              ['src', 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='],
              ['type', 'video/mp4'],
            ],
            [0, 'P'],
            [1, '#text', 'xxxx xxxxxxx xxxxxx xxxx xxx xxxxxxxx xxxxx xxxxx'],
            [15, 'SELECT', ['value', '***']],
            [1, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [3, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [5, 'OPTION', ['aria-label', '***']],
            [1, '#text', '***'],
            [22, 'INPUT', ['type', 'password']],
            [0, 'INPUT', ['type', 'text']],
            [0, 'INPUT', ['type', 'checkbox'], ['id', 'inputFoo'], ['name', '***'], ['value', '***']],
            [0, 'LABEL', ['for', 'inputFoo']],
            [1, '#text', 'xxxxxxxx xxxxx'],
            [27, 'INPUT', ['type', 'radio'], ['id', 'bar-private'], ['name', '***'], ['value', '***']],
            [0, 'TEXTAREA', ['id', 'baz'], ['name', '***'], ['rows', '2'], ['cols', '20'], ['value', '***']],
            [1, '#text', '                xxxxxx xxxxx xxxxxxx xxx\n              '],
            [30, 'DIV', ['contenteditable', '']],
            [1, '#text', 'xxxxxxxx xxxxxxx xxx'],
          ],
          [ChangeType.ScrollPosition, [0, 0, 0]],
          [ChangeType.AddStyleSheet, ['.example { color: red; }']],
          [ChangeType.AttachedStyleSheets, [5, 0]],
          [ChangeType.MediaPlaybackState, [20, PlaybackState.Paused]],
        ])
      })
    })
  })
})
