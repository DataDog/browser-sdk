import fs from 'fs'
import ts, { SyntaxKind } from 'typescript'
import type { DeclarationReflection, SomeType } from 'typedoc'
import { Application, ReflectionKind } from 'typedoc'
import type { Html } from './html'
import { html } from './html'

async function main() {
  const application = await Application.bootstrap({
    entryPoints: ['./packages/rum/src/entries/main.ts'],
    tsconfig: './packages/rum/tsconfig.esm.json',
    sort: ['source-order'],
  })

  const reflexion = (await application.convert())!

  const output = html`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>API Reference</title>
        <style>
          .members {
            margin-left: 1em;
          }
          .excerpt-identifier {
          }
          pre {
            border: 1px solid #ccc;
            padding: 1em;
            background-color: #f8f8f8;
          }
        </style>
      </head>
      <body>
        <h1>API Reference</h1>
        ${reflexion.children!.map(renderDeclaration)}
      </body>
    </html>
  `

  fs.writeFileSync('./temp/api-reference.html', output.toString())
}

function renderDeclaration(declaration: DeclarationReflection): Html {
  const kind = ReflectionKind[declaration.kind]
  const level = declaration.kind === ReflectionKind.Property ? 'h4' : 'h3'

  return html`
    <${level}>${kind} <code>${declaration.name}: ${renderOptionalType(declaration.type)}</code></${level}>
    ${renderDeclarationChildren(declaration)}
  `
}

function renderOptionalType(type: SomeType | undefined): Html {
  if (!type) {
    return html``
  }
  let renderedType: Html
  if (type.type === 'reflection') {
    renderedType = html`<code>aa ${renderDeclaration(type.declaration)}</code>`
  } else {
    renderedType = html`<code>${type.toString()}</code>`
  }
  return renderedType
}

function renderDeclarationChildren(declaration: DeclarationReflection): Html {
  if (!declaration.children) {
    return html``
  }
  return html`${declaration.children?.map(renderDeclaration)}`
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
