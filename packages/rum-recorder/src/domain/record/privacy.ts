import {
  CensorshipLevel,
  NodePrivacyLevel,
  NodePrivacyLevelInternal,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_MASK_SEALED,
  PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY_SEALED,
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

import { shouldIgnoreElement } from './serialize'
import { getCensorshipLevel } from './serializationUtils'

const TEXT_MASKING_CHAR = '᙮'
const MIN_LEN_TO_MASK = 80
const WHITESPACE_TEST = /^\s$/

const nodeInternalPrivacyCache = new WeakMap<Node, NodePrivacyLevelInternal>()

export function uncachePrivacyLevel(node: Node) {
  nodeInternalPrivacyCache.delete(node)
}

/**
 * PUBLIC: Resolves the internal privacy level and remaps to level to the format
 * exposed to the general codebase  (allow/mask/hidden/ignore) because
 * NOT_SET/UNKNOWN/*-SEALED/MASK_FORMS_ONLY are not dev friendly and need not be handled by devs
 */
export function getNodePrivacyLevel(
  node: Node,
  parentNodePrivacyLevel?: NodePrivacyLevelInternal
): NodePrivacyLevel.ALLOW | NodePrivacyLevel.MASK | NodePrivacyLevel.IGNORE | NodePrivacyLevel.HIDDEN {
  const privacyLevel = getInternalNodePrivacyLevel(node, parentNodePrivacyLevel)
  return remapInternalPrivacyLevels(node, privacyLevel)
}

/**
 * Remap the internal privacy levels to general use privacy levels
 */
export function remapInternalPrivacyLevels(
  node: Node,
  nodePrivacyLevelInternal: NodePrivacyLevelInternal
): NodePrivacyLevel.ALLOW | NodePrivacyLevel.MASK | NodePrivacyLevel.IGNORE | NodePrivacyLevel.HIDDEN {
  switch (nodePrivacyLevelInternal) {
    case NodePrivacyLevelInternal.ALLOW:
      return NodePrivacyLevel.ALLOW
    case NodePrivacyLevelInternal.MASK:
      return NodePrivacyLevel.MASK
    case NodePrivacyLevelInternal.HIDDEN:
      return NodePrivacyLevel.HIDDEN
    case NodePrivacyLevelInternal.IGNORE:
      return NodePrivacyLevel.IGNORE

    case NodePrivacyLevelInternal.MASK_SEALED:
      return NodePrivacyLevel.MASK
    case NodePrivacyLevelInternal.MASK_FORMS_ONLY_SEALED:
    case NodePrivacyLevelInternal.MASK_FORMS_ONLY:
      return isFormElement(node) ? NodePrivacyLevel.MASK : NodePrivacyLevel.ALLOW
    default:
    case NodePrivacyLevelInternal.UNKNOWN:
    case NodePrivacyLevelInternal.NOT_SET:
      return NodePrivacyLevel.ALLOW // TODO: REVIEW: `hide`, `mask`, or `allow`?
  }
}

/**
 * INTERNAL FUNC: Get privacy level without remapping (or setting cache)
 * This function may be explicitly used when passing internal privacy levels to
 * child nodes for performance reasons, otherwise you should use `getNodePrivacyLevel`
 */
export function getInternalNodePrivacyLevel(
  node: Node,
  parentNodePrivacyLevel?: NodePrivacyLevelInternal
): NodePrivacyLevelInternal {
  if (!node) {
    // TODO: TODO: remove before PR
    throw new Error('RUNTIME_ASSERTION')
  }
  const isElementNode = node.nodeType === Node.ELEMENT_NODE

  const cachedPrivacyLevel = nodeInternalPrivacyCache.get(node)
  if (cachedPrivacyLevel) {
    return cachedPrivacyLevel
  }

  // Only Elements have tags directly applied
  if (node.parentElement && !isElementNode) {
    return parentNodePrivacyLevel || getInternalNodePrivacyLevel(node.parentElement)
  }

  let parentNodePrivacyLevelFallback: NodePrivacyLevelInternal
  // Recursive Fallback
  if (!parentNodePrivacyLevel) {
    parentNodePrivacyLevelFallback = node?.parentNode
      ? getInternalNodePrivacyLevel(node.parentNode)
      : NodePrivacyLevelInternal.NOT_SET
  }

  const selfPrivacyLevel = getNodeSelfPrivacyLevel(node)
  const privacyLevel = derivePrivacyLevelGivenParent(
    selfPrivacyLevel,
    parentNodePrivacyLevel || parentNodePrivacyLevelFallback!
  )

  /**
   * Cache privacy level for faster mutation observer lookups
   * Text nodes depend upon the parent element so are not cached.
   * DIRTY: During tests, we pass in different ancestor privacy levels so we
   * can't cache the privacy level if `parentNodePrivacyLevel` is passed in.
   * TODO: TODO: Cleanup tests to avoid this effect, or use a new method
   */
  if (isElementNode && !parentNodePrivacyLevel) {
    nodeInternalPrivacyCache.set(node, privacyLevel)
  }
  return privacyLevel
}

/**
 * Reduces the next privacy level based on self + parent privacy levels
 */
export function derivePrivacyLevelGivenParent(
  childPrivacyLevel: NodePrivacyLevelInternal,
  parentNodePrivacyLevel: NodePrivacyLevelInternal
): NodePrivacyLevelInternal {
  switch (parentNodePrivacyLevel) {
    // These values cannot be overrided
    case NodePrivacyLevelInternal.MASK_SEALED:
    case NodePrivacyLevelInternal.MASK_FORMS_ONLY_SEALED:
    case NodePrivacyLevelInternal.HIDDEN:
    case NodePrivacyLevelInternal.IGNORE:
      return parentNodePrivacyLevel
  }
  switch (childPrivacyLevel) {
    case NodePrivacyLevelInternal.NOT_SET:
      return parentNodePrivacyLevel
    case NodePrivacyLevelInternal.ALLOW:
    case NodePrivacyLevelInternal.MASK:
    case NodePrivacyLevelInternal.MASK_FORMS_ONLY:
    case NodePrivacyLevelInternal.HIDDEN:
    case NodePrivacyLevelInternal.IGNORE:
    case NodePrivacyLevelInternal.MASK_SEALED:
    case NodePrivacyLevelInternal.MASK_FORMS_ONLY_SEALED:
      return childPrivacyLevel
  }
  // Anything else is unknown.
  return NodePrivacyLevelInternal.UNKNOWN
}

/**
 * Determines the node's own censorship level without checking for ancestors.
 * This function is purposely not exposed because we do care about the ancestor level.
 * As per our privacy spreadsheet, we will `overrule` privacy tags to protect user passwords and autocomplete fields.
 */
export function getNodeSelfPrivacyLevel(node: Node | undefined): NodePrivacyLevelInternal {
  if (!node) {
    return NodePrivacyLevelInternal.UNKNOWN
  }

  // Only Element types can be have a privacy level set
  if (node.nodeType === Node.ELEMENT_NODE) {
    const elNode = node as HTMLElement
    const privAttr = elNode.getAttribute(PRIVACY_ATTR_NAME)

    // There are a few `overrules` to enforce for end-user protection
    if (elNode.tagName === 'BASE') {
      return NodePrivacyLevelInternal.ALLOW
    }
    if (elNode.tagName === 'INPUT') {
      const inputElement = elNode as HTMLInputElement
      if (inputElement.type === 'password' || inputElement.type === 'email' || inputElement.type === 'tel') {
        return NodePrivacyLevelInternal.MASK
      }
      if (inputElement.type === 'hidden') {
        return NodePrivacyLevelInternal.MASK // TODO: Review: what is the preferred level?
      }
      const autocomplete = inputElement.getAttribute('autocomplete')
      if (autocomplete && autocomplete.startsWith('cc-')) {
        return NodePrivacyLevelInternal.MASK
      }
    }

    // Customers should first specify privacy tags using HTML attributes
    switch (privAttr) {
      case PRIVACY_ATTR_VALUE_ALLOW:
        return NodePrivacyLevelInternal.ALLOW
      case PRIVACY_ATTR_VALUE_MASK:
        return NodePrivacyLevelInternal.MASK
      case PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY:
      case PRIVACY_ATTR_VALUE_INPUT_IGNORED: // Deprecated, now aliased
      case PRIVACY_ATTR_VALUE_INPUT_MASKED: // Deprecated, now aliased
        return NodePrivacyLevelInternal.MASK_FORMS_ONLY
      case PRIVACY_ATTR_VALUE_HIDDEN:
        return NodePrivacyLevelInternal.HIDDEN
      case PRIVACY_ATTR_VALUE_MASK_SEALED:
        return NodePrivacyLevelInternal.MASK_SEALED
      case PRIVACY_ATTR_VALUE_MASK_FORMS_ONLY_SEALED:
        return NodePrivacyLevelInternal.MASK_FORMS_ONLY_SEALED
    }

    // But we also need to support class based privacy tagging for certain frameworks
    if (elNode.classList.contains(PRIVACY_CLASS_ALLOW)) {
      return NodePrivacyLevelInternal.ALLOW
    } else if (elNode.classList.contains(PRIVACY_CLASS_MASK)) {
      return NodePrivacyLevelInternal.MASK
    } else if (elNode.classList.contains(PRIVACY_CLASS_HIDDEN)) {
      return NodePrivacyLevelInternal.HIDDEN
    } else if (
      elNode.classList.contains(PRIVACY_CLASS_MASK_FORMS_ONLY) ||
      elNode.classList.contains(PRIVACY_CLASS_INPUT_MASKED) || // Deprecated, now aliased
      elNode.classList.contains(PRIVACY_CLASS_INPUT_IGNORED) // Deprecated, now aliased
    ) {
      return NodePrivacyLevelInternal.MASK_FORMS_ONLY
    } else if (shouldIgnoreElement(elNode)) {
      // such as for scripts
      return NodePrivacyLevelInternal.IGNORE
    }
  }

  // Other node types cannot be tagged directly
  return NodePrivacyLevelInternal.NOT_SET
}

// Returns true if the given DOM node should be hidden. Ancestors
// are not checked.
export function nodeShouldBeHidden(node: Node): boolean {
  if (isElement(node)) {
    return (
      node.getAttribute(PRIVACY_ATTR_NAME) === PRIVACY_ATTR_VALUE_HIDDEN ||
      node.classList.contains(PRIVACY_CLASS_HIDDEN)
    )
  } else if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement) {
      return nodeShouldBeHidden(node.parentElement)
    }
    const censorshipLevel = getCensorshipLevel()
    return censorshipLevel === CensorshipLevel.PRIVATE
  } else if (node.nodeType === Node.DOCUMENT_NODE) {
    const censorshipLevel = getCensorshipLevel()
    return censorshipLevel === CensorshipLevel.PRIVATE
  }
  return false
}

export function getAttributesForPrivacyLevel(
  element: Element,
  nodePrivacyLevel: NodePrivacyLevel
): Record<string, string | number | boolean> {
  /*
    NEVER ALLOW	`value` under these conditions
    input[type=password]	
    input[autocomplete=cc-number/cc-csc/cc-exp/cc-exp-month/cc-exp-year]	
    MAYBE: input[type=tel,email]	
  */
  if (nodePrivacyLevel === NodePrivacyLevel.HIDDEN) {
    return {}
  }

  const tagName = element.tagName
  const attrList = Array.from(element.attributes).map((attr) => ({ value: attr.value, name: attr.name }))
  const safeAttrs: Record<string, string> = {}

  for (const { name: attrName, value: attrVal } of attrList) {
    // Never take those attributes into account, as they will be conditionally added in `serializeElementNode`
    if (attrName === 'value' || attrName === 'selected' || attrName === 'checked') {
      continue
    }
    safeAttrs[attrName] = attrVal
  }

  if (nodePrivacyLevel === NodePrivacyLevel.MASK) {
    // Mask Attribute text content
    if (safeAttrs.title) {
      safeAttrs.title = CENSORED_STRING_MARK
    }
    if (safeAttrs.alt) {
      safeAttrs.alt = CENSORED_STRING_MARK
    }

    // mask image URLs
    if (tagName === 'IMG' || tagName === 'SOURCE') {
      if (safeAttrs.src) {
        safeAttrs.src = CENSORED_IMG_MARK
      }
      if (safeAttrs.srcset) {
        safeAttrs.srcset = CENSORED_IMG_MARK
      }
    }
    // mask <a> URLs
    if (tagName === 'A') {
      if (safeAttrs.href) {
        safeAttrs.href = CENSORED_STRING_MARK
      }
    }
    // mask data-* attributes
    for (const { name: attrName, value: attrVal } of attrList) {
      if (attrName.startsWith('data-') && attrVal && attrName !== PRIVACY_ATTR_NAME) {
        // safe to reveal `${PRIVACY_ATTR_NAME}` attr
        safeAttrs[attrName] = CENSORED_STRING_MARK
      }
    }
  }
  return safeAttrs
}

// Returns true if the given DOM node should be hidden, recursively
// checking its ancestors.
export function nodeOrAncestorsShouldBeHidden(node: Node | null): boolean {
  if (!node) {
    // TODO: This strategy implies "default" is just setting the initial value for us. There is no concept of unknown.
    // Walking up the tree results in a node without a parent so fallback to default
    // Walking down the tree results in no children to fallback to defaul
    const censorshipLevel = getCensorshipLevel()
    return censorshipLevel === CensorshipLevel.PRIVATE
  }

  if (nodeShouldBeHidden(node)) {
    return true
  }

  return nodeOrAncestorsShouldBeHidden(node.parentNode)
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

export function isFormElement(node: Node | null): boolean {
  if (!node || node.nodeType !== node.ELEMENT_NODE) {
    return false
  }
  const element = node as HTMLInputElement
  if (element.tagName === 'INPUT') {
    const type = element.getAttribute('type') || ''
    switch (type.toLowerCase()) {
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
export const censorText = (text: string) => {
  if (text.length <= MIN_LEN_TO_MASK) {
    return text.replace(/[^\s]/g, TEXT_MASKING_CHAR)
  }
  return scrambleText(text)
}

/**
 * Bias free random order sorting with Fisher-Yates algorithm
 */
export function shuffle<T>(array: T[]) {
  // https://bost.ocks.org/mike/shuffle/
  let m = array.length
  let t
  let i
  while (m) {
    i = Math.floor(Math.random() * m--)
    t = array[m]
    array[m] = array[i]
    array[i] = t
  }
  return array
}

/**
 * Scrambles all non-whitespace characters, with minimal transformations to preserve pixel perfect text shape.
 * We add in 10% of entropy to minimally protect the charset.
 */
const scrambleText = (text: string) => {
  const reducedText = text.toLocaleLowerCase().replace(/[0-9]/gi, '0') // Hide financial data
  const reducedChars = Array.from(reducedText)
  const chars = []
  for (let i = 0; i < reducedChars.length; i++) {
    if (!WHITESPACE_TEST.test(reducedChars[i])) {
      chars.push(reducedChars[i])
    }
  }
  // Add 10% TEXT_MASKING_CHAR so that the charset is randomized by 10%
  const addRandCharsLength = Math.ceil(reducedChars.length * 0.1)
  const newChars = new Array(addRandCharsLength).fill(TEXT_MASKING_CHAR)
  Array.prototype.push.apply(chars, newChars)
  shuffle(chars)
  // Now we put the scrambled chars back into the string, around the origional whitespace
  const whitespacedText = []
  let i = 0
  while (whitespacedText.length < reducedChars.length) {
    if (WHITESPACE_TEST.test(reducedChars[i])) {
      whitespacedText.push(reducedChars[i])
    } else {
      whitespacedText.push(chars.pop())
    }
    i++
  }
  return whitespacedText.join('')
}
