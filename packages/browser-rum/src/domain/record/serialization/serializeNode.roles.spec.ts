import { ChangeType, StringRole } from '../../../types'
import { createString } from '../encoding'
import { serializeHtml } from '../test/serializeHtml.specHelper'

describe('string roles of a serialized node', () => {
  it('puts node names and attributes in their own roles', async () => {
    const record = await serializeHtml('<div id="container"></div>', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, 'DIV'),
          [createString(StringRole.AttributeName, 'id'), createString(StringRole.AttributeValue, 'container')],
        ],
      ],
    ])
  })

  it('puts text content in the text content role', async () => {
    const record = await serializeHtml('<div>link text</div>', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [null, createString(StringRole.NodeName, 'DIV')],
        [1, createString(StringRole.NodeName, '#text'), createString(StringRole.TextContent, 'link text')],
      ],
    ])
  })

  it('puts form input values in the form input role', async () => {
    const record = await serializeHtml('<input value="typed text" />', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, 'INPUT'),
          [createString(StringRole.AttributeName, 'value'), createString(StringRole.FormInput, 'typed text')],
        ],
      ],
    ])
  })

  it('puts the value of every kind of form element in the form input role', async () => {
    const record = await serializeHtml('<select><option value="chosen"></option></select>', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, 'SELECT'),
          [createString(StringRole.AttributeName, 'value'), createString(StringRole.FormInput, 'chosen')],
        ],
        [
          1,
          createString(StringRole.NodeName, 'OPTION'),
          [createString(StringRole.AttributeName, 'value'), createString(StringRole.FormInput, 'chosen')],
          [createString(StringRole.AttributeName, 'selected'), createString(StringRole.AttributeValue, '')],
        ],
      ],
    ])
  })

  it('puts a value attribute on an element with no form behavior in the attribute value role', async () => {
    const record = await serializeHtml('<li value="3"></li>', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, 'LI'),
          [createString(StringRole.AttributeName, 'value'), createString(StringRole.AttributeValue, '3')],
        ],
      ],
    ])
  })

  it('puts inline styles in the CSS role', async () => {
    const record = await serializeHtml('<div style="color: red"></div>', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, 'DIV'),
          [createString(StringRole.AttributeName, 'style'), createString(StringRole.Css, 'color: red')],
        ],
      ],
    ])
  })

  it('puts URL attribute values in the URL role', async () => {
    const record = await serializeHtml('<a href="https://example.com/"></a>', { roles: 'keep' })
    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, 'A'),
          [createString(StringRole.AttributeName, 'href'), createString(StringRole.Url, 'https://example.com/')],
        ],
      ],
    ])
  })

  it("puts a #doctype's name and ids in their own roles", async () => {
    // A legacy doctype, since the HTML5 one has an empty public id and system id and so says
    // nothing about the roles they are given.
    const publicId = '-//W3C//DTD HTML 4.01//EN'
    const systemId = 'http://www.w3.org/TR/html4/strict.dtd'

    const record = await serializeHtml(`<!DOCTYPE html PUBLIC "${publicId}" "${systemId}"><html></html>`, {
      input: 'document',
      roles: 'keep',
      target: (node: Node) => (node as Document).doctype!,
    })

    expect(record?.data).toEqual([
      [
        ChangeType.AddNode,
        [
          null,
          createString(StringRole.NodeName, '#doctype'),
          createString(StringRole.AttributeValue, 'html'),
          createString(StringRole.AttributeValue, publicId),
          createString(StringRole.Url, systemId),
        ],
      ],
    ])
  })
})
