import type { BrowserWindow } from '@datadog/browser-rum-core'
import {
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED,
  PRIVACY_ATTR_VALUE_MASK_USER_INPUT,
} from '@datadog/browser-rum-core'
import { registerCleanupTask } from '../../../../../core/test'
import { ChangeType } from '../../../types'

import { serializeHtmlAsChange } from './serializeHtml.specHelper'

describe('serializeNodeAsChange for form elements', () => {
  let originalTimeout: number

  beforeAll(() => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000
  })

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout
  })

  describe('<input type="button">', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange('<input type="button" value="Click here"></input>')
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'button'], ['value', 'Click here']]]])
    })

    it('does not mask the value if the <input> has privacy level MASK_USER_INPUT', async () => {
      const record = await serializeHtmlAsChange(`
          <input
            ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
            type="button"
            value="Click here"
          ></input>
        `)
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [
            null,
            'INPUT',
            [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
            ['type', 'button'],
            ['value', 'Click here'],
          ],
        ],
      ])
    })

    it('does not mask the value if an ancestor has privacy level MASK_USER_INPUT', async () => {
      // Check that the ancestor's privacy level takes effect when we serialize
      // a descendant <input> directly.
      const record = await serializeHtmlAsChange(
        `
          <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">
            <input type="button" value="Click here"></input>
          </div>
        `,
        {
          target: (node: Node): Node => node.firstChild!,
        }
      )
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'button'], ['value', 'Click here']]]])
    })

    it('does not mask the value when serializing an ancestor with privacy level MASK_USER_INPUT', async () => {
      // Check that the ancestor's privacy level takes effect when we serialize
      // the ancestor and the <input> appears within the serialized subtree.
      const record = await serializeHtmlAsChange(`
          <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">
            <input type="button" value="Click here"></input>
          </div>
        `)
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'DIV', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT]],
          [1, 'INPUT', ['type', 'button'], ['value', 'Click here']],
        ],
      ])
    })
  })

  describe('<input type="checkbox">', () => {
    describe('which is unchecked', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="checkbox" value="on"></input>')
        expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'checkbox'], ['value', 'on']]]])
      })

      it('serializes a MASK_USER_INPUT element', async () => {
        const record = await serializeHtmlAsChange(`
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="checkbox"
              value="on"
            ></input>
          `)
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'checkbox'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })

    describe('which is checked by default', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="checkbox" value="on" checked></input>')
        expect(record?.data).toEqual([
          [ChangeType.AddNode, [null, 'INPUT', ['type', 'checkbox'], ['value', 'on'], ['checked', '']]],
        ])
      })

      it('serializes a MASK_USER_INPUT element without the "checked" attribute', async () => {
        const record = await serializeHtmlAsChange(`
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="checkbox"
              value="on"
              checked
            ></input>
          `)
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'checkbox'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })

    describe('which is checked by property setter', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="checkbox" value="on"></input>', {
          before(target: Node): void {
            ;(target as HTMLInputElement).checked = true
          },
        })
        expect(record?.data).toEqual([
          [ChangeType.AddNode, [null, 'INPUT', ['type', 'checkbox'], ['value', 'on'], ['checked', '']]],
        ])
      })

      it('serializes a MASK_USER_INPUT element without the "checked" attribute', async () => {
        const record = await serializeHtmlAsChange(
          `
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="checkbox"
              value="on"
            ></input>
            `,
          {
            before(target: Node): void {
              ;(target as HTMLInputElement).checked = true
            },
          }
        )
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'checkbox'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })

    describe('which is unchecked by property setter', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="checkbox" value="on" checked></input>', {
          before(target: Node): void {
            ;(target as HTMLInputElement).checked = false
          },
        })
        expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'checkbox'], ['value', 'on']]]])
      })

      it('serializes a MASK_USER_INPUT element without the "checked" attribute', async () => {
        const record = await serializeHtmlAsChange(
          `
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="checkbox"
              value="on"
              checked
            ></input>
            `,
          {
            before(target: Node): void {
              ;(target as HTMLInputElement).checked = false
            },
          }
        )
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'checkbox'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })
  })

  describe('<input type="password">', () => {
    it('does not serialize a value set via property setter', async () => {
      const record = await serializeHtmlAsChange('<input type="password"></input>', {
        before(target: Node): void {
          ;(target as HTMLInputElement).value = 'toto'
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'password'], ['value', '***']]]])
    })

    it('does not serialize a value set via attribute setter', async () => {
      const record = await serializeHtmlAsChange('<input type="password"></input>', {
        before(target: Node): void {
          ;(target as HTMLInputElement).setAttribute('value', 'toto')
        },
      })
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'password'], ['value', '***']]]])
    })
  })

  describe('<input type="radio">', () => {
    describe('which is unchecked', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="radio" value="on"></input>')
        expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'radio'], ['value', 'on']]]])
      })

      it('serializes a MASK_USER_INPUT element', async () => {
        const record = await serializeHtmlAsChange(`
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="radio"
              value="on"
            ></input>
          `)
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'radio'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })

    describe('which is checked by default', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="radio" value="on" checked></input>')
        expect(record?.data).toEqual([
          [ChangeType.AddNode, [null, 'INPUT', ['type', 'radio'], ['value', 'on'], ['checked', '']]],
        ])
      })

      it('serializes a MASK_USER_INPUT element without the "checked" attribute', async () => {
        const record = await serializeHtmlAsChange(`
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="radio"
              value="on"
              checked
            ></input>
          `)
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'radio'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })

    describe('which is checked by property setter', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="radio" value="on"></input>', {
          before(target: Node): void {
            ;(target as HTMLInputElement).checked = true
          },
        })
        expect(record?.data).toEqual([
          [ChangeType.AddNode, [null, 'INPUT', ['type', 'radio'], ['value', 'on'], ['checked', '']]],
        ])
      })

      it('serializes a MASK_USER_INPUT element without the "checked" attribute', async () => {
        const record = await serializeHtmlAsChange(
          `
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="radio"
              value="on"
            ></input>
            `,
          {
            before(target: Node): void {
              ;(target as HTMLInputElement).checked = true
            },
          }
        )
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'radio'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })

    describe('which is unchecked by property setter', () => {
      it('serializes the element', async () => {
        const record = await serializeHtmlAsChange('<input type="radio" value="on" checked></input>', {
          before(target: Node): void {
            ;(target as HTMLInputElement).checked = false
          },
        })
        expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'radio'], ['value', 'on']]]])
      })

      it('serializes a MASK_USER_INPUT element without the "checked" attribute', async () => {
        const record = await serializeHtmlAsChange(
          `
            <input
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
              type="radio"
              value="on"
              checked
            ></input>
            `,
          {
            before(target: Node): void {
              ;(target as HTMLInputElement).checked = false
            },
          }
        )
        expect(record?.data).toEqual([
          [
            ChangeType.AddNode,
            [
              null,
              'INPUT',
              [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
              ['type', 'radio'],
              ['value', '***'],
            ],
          ],
        ])
      })
    })
  })

  describe('<input type="submit">', () => {
    it('serializes the element', async () => {
      const record = await serializeHtmlAsChange('<input type="submit" value="Click here"></input>')
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'submit'], ['value', 'Click here']]]])
    })

    it('does not mask the value if the <input> has privacy level MASK_USER_INPUT', async () => {
      const record = await serializeHtmlAsChange(`
          <input
            ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
            type="submit"
            value="Click here"
          ></input>
        `)
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [
            null,
            'INPUT',
            [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
            ['type', 'submit'],
            ['value', 'Click here'],
          ],
        ],
      ])
    })

    it('does not mask the value if an ancestor has privacy level MASK_USER_INPUT', async () => {
      // Check that the ancestor's privacy level takes effect when we serialize
      // a descendant <input> directly.
      const record = await serializeHtmlAsChange(
        `
          <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">
            <input type="submit" value="Click here"></input>
          </div>
        `,
        {
          target: (node: Node): Node => node.firstChild!,
        }
      )
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ['type', 'submit'], ['value', 'Click here']]]])
    })

    it('does not mask the value when serializing an ancestor with privacy level MASK_USER_INPUT', async () => {
      // Check that the ancestor's privacy level takes effect when we serialize
      // the ancestor and the <input> appears within the serialized subtree.
      const record = await serializeHtmlAsChange(`
          <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">
            <input type="submit" value="Click here"></input>
          </div>
        `)
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'DIV', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT]],
          [1, 'INPUT', ['type', 'submit'], ['value', 'Click here']],
        ],
      ])
    })
  })

  describe('<input type="text">', () => {
    for (const { typeAttributeDescription, typeAttribute, serializedTypeAttribute } of [
      {
        typeAttributeDescription: 'explicit "type" attribute',
        typeAttribute: 'type="text"',
        serializedTypeAttribute: [['type', 'text']] as Array<[string, string]>,
      },
      { typeAttributeDescription: 'implicit type', typeAttribute: '', serializedTypeAttribute: [] },
    ]) {
      describe(`with ${typeAttributeDescription}`, () => {
        it('serializes the element', async () => {
          const record = await serializeHtmlAsChange(`<input ${typeAttribute}></input>`)
          expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'INPUT', ...serializedTypeAttribute]]])
        })

        it('serializes the placeholder', async () => {
          const record = await serializeHtmlAsChange(`<input ${typeAttribute} placeholder="placeholder"></input>`)
          expect(record?.data).toEqual([
            [ChangeType.AddNode, [null, 'INPUT', ...serializedTypeAttribute, ['placeholder', 'placeholder']]],
          ])
        })

        it('serializes the element with a value set by attribute', async () => {
          const record = await serializeHtmlAsChange(`<input ${typeAttribute} value="toto"></input>`)
          expect(record?.data).toEqual([
            [ChangeType.AddNode, [null, 'INPUT', ...serializedTypeAttribute, ['value', 'toto']]],
          ])
        })

        it('serializes the element with a value set by property setter', async () => {
          const record = await serializeHtmlAsChange(`<input ${typeAttribute}></input>`, {
            before(target: Node): void {
              ;(target as HTMLInputElement).value = 'toto'
            },
          })
          expect(record?.data).toEqual([
            [ChangeType.AddNode, [null, 'INPUT', ...serializedTypeAttribute, ['value', 'toto']]],
          ])
        })

        it('masks the value and placeholder if the element has privacy level MASK', async () => {
          const record = await serializeHtmlAsChange(
            `
            <input
              ${typeAttribute}
              placeholder="placeholder"
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK}"
            ></input>
            `,
            {
              before(target: Node): void {
                ;(target as HTMLInputElement).value = 'toto'
              },
            }
          )
          expect(record?.data).toEqual([
            [
              ChangeType.AddNode,
              [
                null,
                'INPUT',
                ...serializedTypeAttribute,
                ['placeholder', '***'],
                [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK],
                ['value', '***'],
              ],
            ],
          ])
        })

        it('masks the value if the element has privacy level MASK_USER_INPUT', async () => {
          const record = await serializeHtmlAsChange(
            `
            <input
              ${typeAttribute}
              placeholder="placeholder"
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}"
            ></input>
            `,
            {
              before(target: Node): void {
                ;(target as HTMLInputElement).value = 'toto'
              },
            }
          )
          expect(record?.data).toEqual([
            [
              ChangeType.AddNode,
              [
                null,
                'INPUT',
                ...serializedTypeAttribute,
                ['placeholder', 'placeholder'],
                [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT],
                ['value', '***'],
              ],
            ],
          ])
        })

        it('masks the value if an ancestor has privacy level MASK_USER_INPUT', async () => {
          // Check that the ancestor's privacy level takes effect when we serialize
          // a descendant <input> directly.
          const record = await serializeHtmlAsChange(
            `
            <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">
              <input ${typeAttribute} placeholder="placeholder"></input>
            </div>
            `,
            {
              target(defaultTarget: Node): Node {
                return defaultTarget.firstChild!
              },
              before(target: Node): void {
                ;(target as HTMLInputElement).value = 'toto'
              },
            }
          )
          expect(record?.data).toEqual([
            [
              ChangeType.AddNode,
              [null, 'INPUT', ...serializedTypeAttribute, ['placeholder', 'placeholder'], ['value', '***']],
            ],
          ])
        })

        it('masks the value when serializing an ancestor with privacy level MASK_USER_INPUT', async () => {
          // Check that the ancestor's privacy level takes effect when we serialize
          // the ancestor and the <input> appears within the serialized subtree.
          const record = await serializeHtmlAsChange(
            `
            <div ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">
              <input ${typeAttribute} placeholder="placeholder"></input>
            </div>
            `,
            {
              before(target: Node): void {
                ;(target.firstChild as HTMLInputElement).value = 'toto'
              },
            }
          )
          expect(record?.data).toEqual([
            [
              ChangeType.AddNode,
              [null, 'DIV', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT]],
              [1, 'INPUT', ...serializedTypeAttribute, ['placeholder', 'placeholder'], ['value', '***']],
            ],
          ])
        })

        it('masks the placeholder and value if the element has privacy level MASK_UNLESS_ALLOWLISTED', async () => {
          const record = await serializeHtmlAsChange(
            `
            <input
              ${typeAttribute}
              placeholder="placeholder"
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED}"
            ></input>
            `,
            {
              before(target: Node): void {
                ;(target as HTMLInputElement).value = 'toto'
              },
            }
          )
          expect(record?.data).toEqual([
            [
              ChangeType.AddNode,
              [
                null,
                'INPUT',
                ...serializedTypeAttribute,
                ['placeholder', '***'],
                [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED],
                ['value', '***'],
              ],
            ],
          ])
        })

        it('does not permit allowlisting the placeholder or the value if the element has privacy level MASK_UNLESS_ALLOWLISTED', async () => {
          ;(window as BrowserWindow).$DD_ALLOW = new Set(['allowlisted-string'])
          registerCleanupTask(() => {
            delete (window as BrowserWindow).$DD_ALLOW
          })

          const record = await serializeHtmlAsChange(
            `
            <input
              ${typeAttribute}
              placeholder="allowlisted-string"
              ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED}"
            ></input>
            `,
            {
              before(target: Node): void {
                ;(target as HTMLInputElement).value = 'allowlisted-string'
              },
            }
          )
          expect(record?.data).toEqual([
            [
              ChangeType.AddNode,
              [
                null,
                'INPUT',
                ...serializedTypeAttribute,
                ['placeholder', '***'],
                [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED],
                ['value', '***'],
              ],
            ],
          ])
        })
      })
    }
  })

  /*
  describe('<select>', () => {
    it('serializes <select> elements value and selected state', async () => {
      const select = document.createElement('select')
      const option1 = document.createElement('option')
      option1.value = 'foo'
      select.appendChild(option1)
      const option2 = document.createElement('option')
      option2.value = 'bar'
      select.appendChild(option2)
      select.options.selectedIndex = 1

      expect(await serializeHtmlAsChangeNode(select, NodePrivacyLevel.ALLOW, transaction)).toEqual(
        jasmine.objectContaining({
          attributes: { value: 'bar' },
          childNodes: [
            jasmine.objectContaining({
              attributes: {
                value: 'foo',
              },
            }),
            jasmine.objectContaining({
              attributes: {
                value: 'bar',
                selected: '',
              },
            }),
          ],
        })
      )
    })
  })
  */

  describe('<textarea>', () => {
    it('serializes the value', async () => {
      const record = await serializeHtmlAsChange('<textarea>toto</textarea>', {
        before(target: Node): void {
          ;(target as HTMLTextAreaElement).value = 'some text'
        },
      })
      expect(record?.data).toEqual([
        [ChangeType.AddNode, [null, 'TEXTAREA', ['value', 'some text']], [1, '#text', 'toto']],
      ])
    })

    it('serializes the default value', async () => {
      const record = await serializeHtmlAsChange('<textarea>toto</textarea>')
      expect(record?.data).toEqual([[ChangeType.AddNode, [null, 'TEXTAREA', ['value', 'toto']], [1, '#text', 'toto']]])
    })

    it('masks the value if the element has privacy level MASK', async () => {
      const record = await serializeHtmlAsChange(
        `<textarea ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK}">toto</textarea>`,
        {
          before(target: Node): void {
            ;(target as HTMLTextAreaElement).value = 'some text'
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'TEXTAREA', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK], ['value', '***']],
          [1, '#text', 'xxxx'],
        ],
      ])
    })

    it('masks the default value if the element has privacy level MASK', async () => {
      const record = await serializeHtmlAsChange(
        `<textarea ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK}">toto</textarea>`
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'TEXTAREA', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK], ['value', '***']],
          [1, '#text', 'xxxx'],
        ],
      ])
    })

    it('masks the value if the element has privacy level MASK_USER_INPUT', async () => {
      const record = await serializeHtmlAsChange(
        `<textarea ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">toto</textarea>`,
        {
          before(target: Node): void {
            ;(target as HTMLTextAreaElement).value = 'some text'
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'TEXTAREA', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT], ['value', '***']],
          [1, '#text', 'xxxx'],
        ],
      ])
    })

    it('masks the default value if the element has privacy level MASK_USER_INPUT', async () => {
      const record = await serializeHtmlAsChange(
        `<textarea ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_USER_INPUT}">toto</textarea>`
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'TEXTAREA', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_USER_INPUT], ['value', '***']],
          [1, '#text', 'xxxx'],
        ],
      ])
    })

    it('does not permit allowlisting the value or the default value if the element has privacy level MASK_UNLESS_ALLOWLISTED', async () => {
      ;(window as BrowserWindow).$DD_ALLOW = new Set(['allowlisted-default', 'allowlisted-value'])
      registerCleanupTask(() => {
        delete (window as BrowserWindow).$DD_ALLOW
      })

      const record = await serializeHtmlAsChange(
        `
        <textarea
          ${PRIVACY_ATTR_NAME}="${PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED}"
        >allowlisted-default</textarea>
        `,
        {
          before(target: Node): void {
            ;(target as HTMLTextAreaElement).value = 'allowlisted-value'
          },
        }
      )
      expect(record?.data).toEqual([
        [
          ChangeType.AddNode,
          [null, 'TEXTAREA', [PRIVACY_ATTR_NAME, PRIVACY_ATTR_VALUE_MASK_UNLESS_ALLOWLISTED], ['value', '***']],
          [1, '#text', 'xxxxxxxxxxxxxxxxxxx'],
        ],
      ])
    })
  })
})
