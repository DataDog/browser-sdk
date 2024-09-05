import fs from 'fs'
import type {
  ApiEntryPoint,
  ApiIndexSignature,
  ApiInterface,
  ApiItem,
  ApiPropertySignature,
  ApiTypeAlias,
  ApiVariable,
  Excerpt,
  ExcerptToken,
} from '@microsoft/api-extractor-model'
import { ApiItemKind, ApiPackage } from '@microsoft/api-extractor-model'
import type { DocComment } from '@microsoft/tsdoc'
import {
  ComponentString,
  GlobalSource,
  type DeclarationReference,
} from '@microsoft/tsdoc/lib-commonjs/beta/DeclarationReference'
import { Html, html } from './html'
import { renderDocComment } from './render-tsdoc'

function main() {
  const apiPackage = ApiPackage.loadFromJsonFile('./temp/browser-rum.api.json')
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
        ${renderApiItem(apiPackage)}
      </body>
    </html>
  `

  fs.writeFileSync('./temp/api-reference.html', output.toString())
}

// Don't sort anything
Array.prototype.sort = function () {
  return this
}

function renderApiItem(apiItem: ApiItem): Html {
  switch (apiItem.kind) {
    case ApiItemKind.Package:
      return renderApiPackage(apiItem as ApiPackage)
    case ApiItemKind.EntryPoint:
      return renderApiEntryPoint(apiItem as ApiEntryPoint)
    case ApiItemKind.Variable:
      return renderApiVariable(apiItem as ApiVariable)
    case ApiItemKind.Interface:
      return renderApiInterface(apiItem as ApiInterface)
    case ApiItemKind.IndexSignature:
      return renderApiIndexSignature(apiItem as ApiIndexSignature)
    case ApiItemKind.PropertySignature:
      return renderApiPropertySignature(apiItem as ApiPropertySignature)
    case ApiItemKind.TypeAlias:
      return renderApiTypeAlias(apiItem as ApiTypeAlias)
    case ApiItemKind.Function:
    case ApiItemKind.Enum:
    case ApiItemKind.EnumMember:
    case ApiItemKind.Namespace:
    case ApiItemKind.Class:
    case ApiItemKind.Property:
    case ApiItemKind.Method:
    case ApiItemKind.Model:
    case ApiItemKind.Constructor:
    case ApiItemKind.CallSignature:
    case ApiItemKind.ConstructSignature:
    case ApiItemKind.MethodSignature:
    case ApiItemKind.None:
      return html`<p>Not implemented: ${apiItem.kind}</p>`
    default:
      apiItem.kind satisfies never
      return Html.empty()
  }
}

function renderApiPackage(apiPackage: ApiPackage): Html {
  return html`
    <h1 id=${renderDeclarationReference(apiPackage.canonicalReference)}>
      ${renderReferenceAnchor(apiPackage.canonicalReference)} Package: <code>${apiPackage.displayName}</code>
    </h1>
    ${renderOptionalDocComment(apiPackage.tsdocComment)} ${renderApiItemMembers(apiPackage)}
  `
}

function renderApiEntryPoint(apiEntryPoint: ApiEntryPoint): Html {
  let path
  const packageName = apiEntryPoint.getAssociatedPackage()!.displayName
  if (!apiEntryPoint.importPath) {
    path = packageName
  } else {
    path = `${packageName}/${apiEntryPoint.importPath}`
  }

  const types: ApiItem[] = []
  const values: ApiItem[] = []
  for (const member of apiEntryPoint.members) {
    if (member.kind === ApiItemKind.Interface || member.kind === ApiItemKind.TypeAlias) {
      types.push(member)
    } else if (member.kind === ApiItemKind.Variable || member.kind === ApiItemKind.Function) {
      values.push(member)
    } else {
      throw new Error(`Unexpected EntryPoint member kind: ${member.kind}`)
    }
  }

  return html`
    <h2 id=${renderDeclarationReference(apiEntryPoint.canonicalReference)}>
      ${renderReferenceAnchor(apiEntryPoint.canonicalReference)} Entry point: <code>${path}</code>
    </h2>
    <h3>Exported values</h3>
    ${values.map((value) => renderApiItem(value))}
    <h3>Exported types</h3>
    ${types.map((type) => renderApiItem(type))}
  `
}

function renderOptionalDocComment(docComment: DocComment | undefined): Html {
  if (!docComment) {
    return Html.empty()
  }

  return renderDocComment(docComment)
}

function renderApiVariable(apiVariable: ApiVariable): Html {
  return html`
    <h3 id=${renderDeclarationReference(apiVariable.canonicalReference)}>
      ${renderReferenceAnchor(apiVariable.canonicalReference)}
      <code>const ${apiVariable.displayName}</code>
    </h3>
    ${renderOptionalDocComment(apiVariable.tsdocComment)} ${renderExcerpt(apiVariable.excerpt)}
  `
}

function renderApiInterface(apiInterface: ApiInterface): Html {
  return html`
    <h3 id=${renderDeclarationReference(apiInterface.canonicalReference)}>
      ${renderReferenceAnchor(apiInterface.canonicalReference)} ${renderExcerpt(apiInterface.excerpt)}
    </h3>
    ${renderOptionalDocComment(apiInterface.tsdocComment)}
    <h4>Members</h4>
    ${renderApiItemMembers(apiInterface)}
  `
}

function renderApiIndexSignature(apiIndexSignature: ApiIndexSignature): Html {
  return html`
    <h4 id=${renderDeclarationReference(apiIndexSignature.canonicalReference)}>
      ${renderReferenceAnchor(apiIndexSignature.canonicalReference)} ${renderExcerpt(apiIndexSignature.excerpt)}
    </h4>
    ${renderOptionalDocComment(apiIndexSignature.tsdocComment)}
  `
}

function renderApiPropertySignature(apiPropertySignature: ApiPropertySignature): Html {
  return html`
    <h4 id=${renderDeclarationReference(apiPropertySignature.canonicalReference)}>
      ${renderReferenceAnchor(apiPropertySignature.canonicalReference)}
      ${renderExcerpt(apiPropertySignature.propertyTypeExcerpt)}
    </h4>
    ${renderOptionalDocComment(apiPropertySignature.tsdocComment)}
  `
}

function renderApiTypeAlias(apiTypeAlias: ApiTypeAlias): Html {
  return html`
    <h3 id=${renderDeclarationReference(apiTypeAlias.canonicalReference)}>
      ${renderReferenceAnchor(apiTypeAlias.canonicalReference)} ${renderExcerpt(apiTypeAlias.excerpt)}
    </h3>
    ${renderOptionalDocComment(apiTypeAlias.tsdocComment)}
  `
}

function renderExcerpt(excerpt: Excerpt): Html {
  return html`<code>${renderExcerptTokens(excerpt.tokens)}</code>`
}

function renderExcerptTokens(tokens: readonly ExcerptToken[]): Html {
  return html`${tokens.map(renderExcerptToken)}`
}

function renderExcerptToken(token: ExcerptToken): Html {
  let text: Html
  if (/^[a-zA-Z0-9]+$/.test(token.text)) {
    text = html`<span class="excerpt-identifier">${token.text}</span>`
  } else {
    text = html`<span class="excerpt-syntax">${token.text}</span>`
  }
  if (token.canonicalReference) {
    return renderReferenceAnchor(token.canonicalReference, text)
  }
  return text
}

function renderDeclarationReference(declarationReference: DeclarationReference): string {
  return escapeAnchor(declarationReference.toString())
}

function renderReferenceAnchor(declarationReference: DeclarationReference, text?: Html): Html {
  if (declarationReference.source instanceof GlobalSource) {
    if (!text) {
      throw new Error('Cannot render global reference anchor without text')
    }

    const component = declarationReference.symbol?.componentPath?.component
    if (component instanceof ComponentString) {
      if (Object.prototype.hasOwnProperty.call(externalLinks, component.text)) {
        return html`<a href=${externalLinks[component.text]}>${text}</a>`
      }
      console.warn(`No external link for ${component.text}`)
    }
    return text
  }
  return html`<a href="#${renderDeclarationReference(declarationReference)}">${text ?? '§'}</a>`
}

const externalLinks: Record<string, string> = {
  Event: 'https://developer.mozilla.org/en-US/docs/Web/API/Event',
  Error: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error',
  PerformanceEntry: 'https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEntry',
  RequestInit: 'https://developer.mozilla.org/en-US/docs/Web/API/RequestInit',
  RequestInfo: 'https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch#resource',
  Response: 'https://developer.mozilla.org/en-US/docs/Web/API/Response',
  Array: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array',
  Location: 'https://developer.mozilla.org/en-US/docs/Web/API/Location',
  XMLHttpRequest: 'https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest',
  Readonly: 'https://www.typescriptlang.org/docs/handbook/utility-types.html#readonlytype',
}

function escapeAnchor(input: string): string {
  // https://www.rfc-editor.org/rfc/rfc3986#section-3.5
  return input.replace(/[^!$&'()*+,;=a-zA-Z0-9._~:@/?-]+/g, '_')
}

function renderApiItemMembers(apiItem: ApiItem): Html {
  if (apiItem.members.length === 0) {
    return Html.empty()
  }

  console.log(apiItem.members[0].canonicalReference.symbol)
  return html`<div class="members">${apiItem.members.map((apiItem) => renderApiItem(apiItem))}</div>`
}

main()
