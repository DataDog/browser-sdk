import {
  NodePrivacyLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_CLASS_ALLOW,
  PRIVACY_CLASS_MASK,
  PRIVACY_CLASS_MASK_FORMS_ONLY,
  PRIVACY_CLASS_HIDDEN,
  FORM_PRIVATE_TAG_NAMES,
  CENSORED_STRING_MARK,
  CENSORED_IMG_MARK,
  // Deprecated (now aliased) below
  PRIVACY_CLASS_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_MASKED,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
} from '../../constants'

import { makeStylesheetUrlsAbsolute, makeSrcsetUrlsAbsolute, makeUrlAbsolute } from './serializationUtils'

import { shouldIgnoreElement } from './serialize'

const TEXT_MASKING_CHAR = '᙮'

export function getInitialPrivacyLevel(): NodePrivacyLevel {
  // REVIEW: may return "ALLOW" | "MASK" | "HIDDEN" OR "MASK_FORMS_ONLY" (internal state)
  // Setting "NOT_SET" will be treated as "MASK_FORMS_ONLY"
  return NodePrivacyLevel.ALLOW
}

/**
 * INTERNAL FUNC: Get privacy level without remapping (or setting cache)
 * This function may be explicitly used when passing internal privacy levels to
 * child nodes for performance reasons, otherwise you should use `getNodePrivacyLevel`
 */
export function getNodePrivacyLevel(
  node: Node,
  initialPrivacyLevel: NodePrivacyLevel = getInitialPrivacyLevel()
): NodePrivacyLevel {
  const parentNodePrivacyLevel = node.parentNode
    ? getNodePrivacyLevel(node.parentNode, initialPrivacyLevel)
    : initialPrivacyLevel
  const selfNodePrivacyLevel = getNodeSelfPrivacyLevel(node)
  return derivePrivacyLevelGivenParent(selfNodePrivacyLevel, parentNodePrivacyLevel)
}

/**
 * Reduces the next privacy level based on self + parent privacy levels
 */
export function derivePrivacyLevelGivenParent(
  childPrivacyLevel: NodePrivacyLevel,
  parentNodePrivacyLevel: NodePrivacyLevel
): NodePrivacyLevel {
  switch (parentNodePrivacyLevel) {
    // These values cannot be overrided
    case NodePrivacyLevel.HIDDEN:
    case NodePrivacyLevel.IGNORE:
      return parentNodePrivacyLevel
  }
  switch (childPrivacyLevel) {
    case NodePrivacyLevel.NOT_SET:
      return parentNodePrivacyLevel
    case NodePrivacyLevel.ALLOW:
    case NodePrivacyLevel.MASK:
    case NodePrivacyLevel.MASK_FORMS_ONLY:
    case NodePrivacyLevel.HIDDEN:
    case NodePrivacyLevel.IGNORE:
      return childPrivacyLevel
    default:
      return parentNodePrivacyLevel
  }
}

/**
 * Determines the node's own privacy level without checking for ancestors.
 * This function is purposely not exposed because we do care about the ancestor level.
 * As per our privacy spreadsheet, we will `overrule` privacy tags to protect user passwords and autocomplete fields.
 */
export function getNodeSelfPrivacyLevel(node: Node): NodePrivacyLevel {
  // Only Element types can be have a privacy level set
  if (isElement(node)) {
    const elNode = node as HTMLElement
    const privAttr = elNode.getAttribute(PRIVACY_ATTR_NAME)

    // There are a few `overrules` to enforce for end-user protection
    if (elNode.tagName === 'BASE') {
      return NodePrivacyLevel.ALLOW
    }
    if (elNode.tagName === 'INPUT') {
      const inputElement = elNode as HTMLInputElement
      if (inputElement.type === 'password' || inputElement.type === 'email' || inputElement.type === 'tel') {
        return NodePrivacyLevel.MASK
      }
      if (inputElement.type === 'hidden') {
        return NodePrivacyLevel.MASK
      }
      const autocomplete = inputElement.getAttribute('autocomplete')
      // Handle input[autocomplete=cc-number/cc-csc/cc-exp/cc-exp-month/cc-exp-year]
      if (autocomplete && autocomplete.indexOf('cc-') === 0) {
        return NodePrivacyLevel.MASK
      }
    }

    // Customers should first specify privacy tags using HTML attributes
    switch (privAttr) {
      case PRIVACY_ATTR_VALUE_ALLOW:
        return NodePrivacyLevel.ALLOW
      case PRIVACY_ATTR_VALUE_MASK:
        return NodePrivacyLevel.MASK
      case PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY:
      case PRIVACY_ATTR_VALUE_INPUT_IGNORED: // Deprecated, now aliased
      case PRIVACY_ATTR_VALUE_INPUT_MASKED: // Deprecated, now aliased
        return NodePrivacyLevel.MASK_FORMS_ONLY
      case PRIVACY_ATTR_VALUE_HIDDEN:
        return NodePrivacyLevel.HIDDEN
    }

    // But we also need to support class based privacy tagging for certain frameworks
    if (elNode.classList.contains(PRIVACY_CLASS_ALLOW)) {
      return NodePrivacyLevel.ALLOW
    } else if (elNode.classList.contains(PRIVACY_CLASS_MASK)) {
      return NodePrivacyLevel.MASK
    } else if (elNode.classList.contains(PRIVACY_CLASS_HIDDEN)) {
      return NodePrivacyLevel.HIDDEN
    } else if (
      elNode.classList.contains(PRIVACY_CLASS_MASK_FORMS_ONLY) ||
      elNode.classList.contains(PRIVACY_CLASS_INPUT_MASKED) || // Deprecated, now aliased
      elNode.classList.contains(PRIVACY_CLASS_INPUT_IGNORED) // Deprecated, now aliased
    ) {
      return NodePrivacyLevel.MASK_FORMS_ONLY
    } else if (shouldIgnoreElement(elNode)) {
      // such as for scripts
      return NodePrivacyLevel.IGNORE
    }
  } else if (node.nodeType === Node.DOCUMENT_NODE) {
    return getInitialPrivacyLevel()
  }

  // Other node types cannot be tagged directly
  return NodePrivacyLevel.NOT_SET
}

export function shouldMaskNode(node: Node, privacyLevel: NodePrivacyLevel) {
  switch (privacyLevel) {
    case NodePrivacyLevel.MASK:
    case NodePrivacyLevel.HIDDEN:
    case NodePrivacyLevel.IGNORE:
      return true
    case NodePrivacyLevel.MASK_FORMS_ONLY:
      return isTextNode(node) ? isFormElement(node.parentNode) : isFormElement(node)
    default:
      return false
  }
}

export function serializeAttribute(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel,
  attributeName: string
): string | number | boolean | null {
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // dup condition for direct access case
    return null
  }
  const attributeValue = element.getAttribute(attributeName)
  if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
    const tagName = element.tagName

    switch (attributeName) {
      // Mask Attribute text content
      case 'title':
      case 'alt':
        return CENSORED_STRING_MARK
    }
    // mask image URLs
    if (tagName === 'IMG' || tagName === 'SOURCE') {
      if (attributeName === 'src' || attributeName === 'srcset') {
        return CENSORED_IMG_MARK
      }
    }
    // mask <a> URLs
    if (tagName === 'A' && attributeName === 'href') {
      return CENSORED_STRING_MARK
    }
    // mask data-* attributes
    if (attributeValue && attributeName.indexOf('data-') === 0 && attributeName !== PRIVACY_ATTR_NAME) {
      // Exception: it's safe to reveal the `${PRIVACY_ATTR_NAME}` attr
      return CENSORED_STRING_MARK
    }
  }

  // Rebuild absolute URLs from relative (without using <base> tag)
  if (!attributeValue || typeof attributeValue !== 'string') {
    return attributeValue
  }
  const doc = element.ownerDocument
  switch (attributeName) {
    case 'src':
    case 'href':
      return makeUrlAbsolute(attributeValue, doc.location?.href)
    case 'srcset':
      return makeSrcsetUrlsAbsolute(attributeValue, doc.location?.href)
    case 'style':
      return makeStylesheetUrlsAbsolute(attributeValue, doc.location?.href)
    default:
      return attributeValue
  }
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE
}

function isFormElement(node: Node | null): boolean {
  if (!node || node.nodeType !== node.ELEMENT_NODE) {
    return false
  }
  const element = node as HTMLInputElement
  if (element.tagName === 'INPUT') {
    switch (element.type) {
      case 'button':
      case 'color':
      case 'reset':
      case 'submit':
        return false
    }
  }
  return !!FORM_PRIVATE_TAG_NAMES[element.tagName]
}

/**
 * Text censoring non-destructively maintains whitespace characters in order to preserve text shape during replay.
 * For short text, simply replace all non-whitespace characters
 * For long text, we assume sufficient text entropy to support scrambling the non-whitespace characters in order to
 * preserve the charset, allowing for near  pixel perfect text shape.
 */
export const censorText = (text: string) => text.replace(/\S/g, TEXT_MASKING_CHAR)

export function getTextContent(
  textNode: Node,
  ignoreWhiteSpace: boolean,
  parentNodePrivacyLevel?: NodePrivacyLevel
): string | undefined {
  // The parent node may not be a html element which has a tagName attribute.
  // So just let it be undefined which is ok in this use case.
  const parentTagName = textNode.parentElement?.tagName
  let textContent = textNode.textContent || ''

  if (ignoreWhiteSpace && !textContent.trim()) {
    return
  }

  const nodePrivacyLevel = parentNodePrivacyLevel || getNodePrivacyLevel(textNode.parentNode as Node)

  const isStyle = parentTagName === 'STYLE' ? true : undefined
  const isScript = parentTagName === 'SCRIPT'

  if (isScript) {
    // For perf reasons, we don't record script (heuristic)
    textContent = CENSORED_STRING_MARK
  } else if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    // Should never occur, but just in case, we set to CENSORED_MARK.
    textContent = CENSORED_STRING_MARK
  } else if (shouldMaskNode(textNode, nodePrivacyLevel)) {
    if (isStyle) {
      // Style tags are `overruled` (Use `hide` to enforce privacy)
      textContent = makeStylesheetUrlsAbsolute(textContent, location.href)
    } else if (
      // Scrambling the child list breaks text nodes for DATALIST/SELECT/OPTGROUP
      parentTagName === 'DATALIST' ||
      parentTagName === 'SELECT' ||
      parentTagName === 'OPTGROUP'
    ) {
      if (!textContent.trim()) {
        return
      }
    } else if (parentTagName === 'OPTION') {
      // <Option> has low entropy in charset + text length, so use `CENSORED_STRING_MARK` when masked
      textContent = CENSORED_STRING_MARK
    } else {
      textContent = censorText(textContent)
    }
  }
  return textContent
}
