import type {
  DocBlockTag,
  DocNodeContainer,
  DocBlock,
  DocComment,
  DocNode,
  DocErrorText,
  DocEscapedText,
  DocFencedCode,
  DocLinkTag,
  DocMemberReference,
  DocMemberIdentifier,
  DocParagraph,
  DocPlainText,
  DocCodeSpan,
} from '@microsoft/tsdoc'
import { DocNodeTransforms, StandardTags } from '@microsoft/tsdoc'

import type { Html } from './html'
import { html } from './html'

export function renderDocComment(docComment: DocComment): Html {
  const outputElements: Html[] = []

  // Summary
  if (docComment.summarySection) {
    outputElements.push(renderDocNodeContainer(docComment.summarySection))
  }

  // Parameters
  if (docComment.params.count > 0) {
    const rows: Html[] = []

    for (const paramBlock of docComment.params.blocks) {
      rows.push(
        html`<tr>
          <td>${paramBlock.parameterName}</td>
          <td>${renderDocNodeContainer(paramBlock.content)}</td>
        </tr>`
      )
    }

    outputElements.push(html`
      <h1>Parameters</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `)
  }

  // Returns
  if (docComment.returnsBlock) {
    outputElements.push(html`
      <h1>Return Value</h1>
      ${renderDocNodeContainer(docComment.returnsBlock.content)}
    `)
  }

  if (docComment.remarksBlock) {
    outputElements.push(html`
      <h1>Remarks</h1>
      ${renderDocNodeContainer(docComment.remarksBlock.content)}
    `)
  }

  const exampleBlocks: DocBlock[] = docComment.customBlocks.filter(
    (x) => x.blockTag.tagNameWithUpperCase === StandardTags.example.tagNameWithUpperCase
  )

  let exampleNumber: number = 1
  for (const exampleBlock of exampleBlocks) {
    const heading: string = exampleBlocks.length > 1 ? `Example ${exampleNumber}` : 'Example'

    outputElements.push(html`
      <h2>${heading}</h2>
      ${renderDocNodeContainer(exampleBlock.content)}
    `)

    ++exampleNumber
  }

  if (docComment.seeBlocks.length > 0) {
    const listItems: Html[] = []
    for (const seeBlock of docComment.seeBlocks) {
      listItems.push(html`<li>${renderDocNodeContainer(seeBlock.content)}</li>`)
    }

    outputElements.push(html`
      <h1>See Also</h1>
      <ul>
        ${listItems}
      </ul>
    `)
  }

  const modifierTags: readonly DocBlockTag[] = docComment.modifierTagSet.nodes

  if (modifierTags.length > 0) {
    const modifierElements: Html[] = []

    for (const modifierTag of modifierTags) {
      modifierElements.push(html`<code>${modifierTag.tagName}</code> `)
    }

    outputElements.push(html`
      <h1>Modifiers</h1>
      ${modifierElements}
    `)
  }

  return html`${outputElements}`
}

function renderDocNodeContainer(section: DocNodeContainer): Html {
  return html`${section.nodes.map(renderDocNode)}`
}

function renderDocNode(node: DocNode): Html | undefined {
  switch (node.kind) {
    case 'CodeSpan':
      return html` <code>${(node as DocCodeSpan).code}</code> `
    case 'ErrorText':
      return html`${(node as DocErrorText).text}`
    case 'EscapedText':
      return html`${(node as DocEscapedText).decodedText}`
    case 'FencedCode': {
      const docFencedCode: DocFencedCode = node as DocFencedCode
      return html`<pre><code>${docFencedCode.code}</code></pre>`
    }
    case 'LinkTag': {
      const linkTag: DocLinkTag = node as DocLinkTag
      if (linkTag.urlDestination) {
        const linkText: string = linkTag.linkText || linkTag.urlDestination
        return html` <a href="#"> ${linkText} </a> `
      }
      let identifier: string = ''
      if (linkTag.codeDestination) {
        // TODO: The library should provide a default rendering for this
        const memberReferences: readonly DocMemberReference[] = linkTag.codeDestination.memberReferences
        if (memberReferences.length > 0) {
          const memberIdentifier: DocMemberIdentifier | undefined =
            memberReferences[memberReferences.length - 1].memberIdentifier
          if (memberIdentifier) {
            identifier = memberIdentifier.identifier
          }
        }
      }
      const linkText: string = linkTag.linkText || identifier || '???'
      return html` <a href="#"> ${linkText} </a> `
    }

    case 'Paragraph': {
      // Collapse spaces in the paragraph
      const transformedParagraph: DocParagraph = DocNodeTransforms.trimSpacesInParagraph(node as DocParagraph)

      return html`<p>${renderDocNodeContainer(transformedParagraph)}</p>`
    }
    case 'PlainText':
      return html`${(node as DocPlainText).text}`
    case 'SoftBreak':
      return html``
  }
  return undefined
}
