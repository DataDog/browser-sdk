export const HTML = `
<head>
    <link href="https://public.com/path/nested?query=param#hash" rel="stylesheet">
    <style>
      .example {content: "anything";}
    </style>
    <script>private</script>
    <meta>
    <base>
    <title>private title</title>
</head>
<body>
    <h1>hello private world</h1>
    <p>Loreum ipsum private text</p>
    <noscript>hello <b>private</b> world</noscript>
    <a href='https://private.com/path/nested?query=param#hash'>
      Click https://private.com/path/nested?query=param#hash
    </a>
    <img src='https://private.com/path/nested?query=param#hash'>
    <select>
      <option>private option A</option>
      <option>private option B</option>
      <option>private option C</option>
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
</body>`

export const AST_HIDDEN = {
  type: 0,
  childNodes: [
    {
      type: 1,
      name: 'html',
      publicId: '',
      systemId: '',
    },
    {
      type: 2,
      tagName: 'html',
      attributes: {
        rr_width: '0px',
        rr_height: '0px',
        'data-dd-privacy': 'hidden',
      },
      childNodes: [],
    },
  ],
}

export const AST_MASK = {
  type: 0,
  childNodes: [
    {
      type: 1,
      name: 'html',
      publicId: '',
      systemId: '',
    },
    {
      type: 2,
      tagName: 'html',
      attributes: {
        'data-dd-privacy': 'mask',
      },
      childNodes: [
        {
          type: 2,
          tagName: 'head',
          attributes: {},
          childNodes: [
            {
              type: 2,
              tagName: 'link',
              attributes: {
                href: 'https://public.com/path/nested?query=param#hash',
                rel: 'stylesheet',
              },
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'style',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '\n      .example {content: "anything";}\n    ',
                  isStyle: true,
                },
              ],
            },
            {
              type: 2,
              tagName: 'meta',
              attributes: {},
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'base',
              attributes: {},
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'title',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮',
                },
              ],
            },
          ],
        },
        {
          type: 3,
          textContent: '\n',
        },
        {
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'h1',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'p',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'noscript',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '᙮᙮᙮᙮᙮ ',
                },
                {
                  type: 2,
                  tagName: 'b',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: '᙮᙮᙮᙮᙮᙮᙮',
                    },
                  ],
                },
                {
                  type: 3,
                  textContent: ' ᙮᙮᙮᙮᙮',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'a',
              attributes: {
                href: '***',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '\n      ᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮᙮\n    ',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'img',
              attributes: {
                src: 'data:image/gif;base64,R0lGODlhAQABAIAAAMLCwgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'select',
              attributes: {
                value: '***',
              },
              childNodes: [
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: '***',
                    },
                  ],
                },
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: '***',
                    },
                  ],
                },
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: '***',
                    },
                  ],
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'password',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'text',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'checkbox',
                name: 'inputFoo',
                value: '***',
                checked: false,
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'label',
              attributes: {
                for: 'inputFoo',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '᙮᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'radio',
                name: 'radioGroup',
                value: '***',
                checked: false,
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'textarea',
              attributes: {
                name: 'baz',
                rows: '2',
                cols: '20',
                value: '***',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '      ᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮\n    ',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'div',
              attributes: {
                contenteditable: '',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '᙮᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮᙮᙮᙮᙮ ᙮᙮᙮',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n',
            },
          ],
        },
      ],
    },
  ],
}

export const AST_MASK_FORMS_ONLY = {
  type: 0,
  childNodes: [
    {
      type: 1,
      name: 'html',
      publicId: '',
      systemId: '',
    },
    {
      type: 2,
      tagName: 'html',
      attributes: {
        'data-dd-privacy': 'mask-forms-only',
      },
      childNodes: [
        {
          type: 2,
          tagName: 'head',
          attributes: {},
          childNodes: [
            {
              type: 2,
              tagName: 'link',
              attributes: {
                href: 'https://public.com/path/nested?query=param#hash',
                rel: 'stylesheet',
              },
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'style',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '\n      .example {content: "anything";}\n    ',
                  isStyle: true,
                },
              ],
            },
            {
              type: 2,
              tagName: 'meta',
              attributes: {},
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'base',
              attributes: {},
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'title',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'private title',
                },
              ],
            },
          ],
        },
        {
          type: 3,
          textContent: '\n',
        },
        {
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'h1',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'hello private world',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'p',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'Loreum ipsum private text',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'noscript',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'hello ',
                },
                {
                  type: 2,
                  tagName: 'b',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private',
                    },
                  ],
                },
                {
                  type: 3,
                  textContent: ' world',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'a',
              attributes: {
                href: 'https://private.com/path/nested?query=param#hash',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '\n      Click https://private.com/path/nested?query=param#hash\n    ',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'img',
              attributes: {
                src: 'https://private.com/path/nested?query=param#hash',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'select',
              attributes: {
                value: '***',
              },
              childNodes: [
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private option A',
                    },
                  ],
                },
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private option B',
                    },
                  ],
                },
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private option C',
                    },
                  ],
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'password',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'text',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'checkbox',
                name: 'inputFoo',
                value: '***',
                checked: false,
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'label',
              attributes: {
                for: 'inputFoo',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: 'inputFoo label',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'radio',
                name: 'radioGroup',
                value: '***',
                checked: false,
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'textarea',
              attributes: {
                name: 'baz',
                rows: '2',
                cols: '20',
                value: '***',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '      Loreum Ipsum private ...\n    ',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'div',
              attributes: {
                contenteditable: '',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: 'editable private div',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n',
            },
          ],
        },
      ],
    },
  ],
}

export const AST_ALLOW = {
  type: 0,
  childNodes: [
    {
      type: 1,
      name: 'html',
      publicId: '',
      systemId: '',
    },
    {
      type: 2,
      tagName: 'html',
      attributes: {
        'data-dd-privacy': 'allow',
      },
      childNodes: [
        {
          type: 2,
          tagName: 'head',
          attributes: {},
          childNodes: [
            {
              type: 2,
              tagName: 'link',
              attributes: {
                href: 'https://public.com/path/nested?query=param#hash',
                rel: 'stylesheet',
              },
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'style',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: '\n      .example {content: "anything";}\n    ',
                  isStyle: true,
                },
              ],
            },
            {
              type: 2,
              tagName: 'meta',
              attributes: {},
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'base',
              attributes: {},
              childNodes: [],
            },
            {
              type: 2,
              tagName: 'title',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'private title',
                },
              ],
            },
          ],
        },
        {
          type: 3,
          textContent: '\n',
        },
        {
          type: 2,
          tagName: 'body',
          attributes: {},
          childNodes: [
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'h1',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'hello private world',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'p',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'Loreum ipsum private text',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'noscript',
              attributes: {},
              childNodes: [
                {
                  type: 3,
                  textContent: 'hello ',
                },
                {
                  type: 2,
                  tagName: 'b',
                  attributes: {},
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private',
                    },
                  ],
                },
                {
                  type: 3,
                  textContent: ' world',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'a',
              attributes: {
                href: 'https://private.com/path/nested?query=param#hash',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '\n      Click https://private.com/path/nested?query=param#hash\n    ',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'img',
              attributes: {
                src: 'https://private.com/path/nested?query=param#hash',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'select',
              attributes: {
                value: 'private option A',
              },
              childNodes: [
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {
                    selected: true,
                    value: 'private option A',
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private option A',
                    },
                  ],
                },
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {
                    value: 'private option B',
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private option B',
                    },
                  ],
                },
                {
                  type: 2,
                  tagName: 'option',
                  attributes: {
                    value: 'private option C',
                  },
                  childNodes: [
                    {
                      type: 3,
                      textContent: 'private option C',
                    },
                  ],
                },
              ],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'password',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'text',
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'checkbox',
                name: 'inputFoo',
                value: 'on',
                checked: true,
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n    ',
            },
            {
              type: 2,
              tagName: 'label',
              attributes: {
                for: 'inputFoo',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: 'inputFoo label',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'input',
              attributes: {
                type: 'radio',
                name: 'radioGroup',
                value: 'bar-private',
                checked: false,
              },
              childNodes: [],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'textarea',
              attributes: {
                name: 'baz',
                rows: '2',
                cols: '20',
                value: '      Loreum Ipsum private ...\n    ',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: '      Loreum Ipsum private ...\n    ',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n\n    ',
            },
            {
              type: 2,
              tagName: 'div',
              attributes: {
                contenteditable: '',
              },
              childNodes: [
                {
                  type: 3,
                  textContent: 'editable private div',
                },
              ],
            },
            {
              type: 3,
              textContent: '\n',
            },
          ],
        },
      ],
    },
  ],
}
