import {
  CensorshipLevel,
  NodeCensorshipTag,
  InputPrivacyMode,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
  PRIVACY_ATTR_VALUE_ALLOW,
  PRIVACY_ATTR_VALUE_MASK,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_MASK_SEALED,
  PRIVACY_CLASS_ALLOW,
  PRIVACY_CLASS_HIDDEN,
  PRIVACY_CLASS_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_MASKED,
  FORM_PRIVATE_TAG_NAMES,
  CENSORED_STRING_MARK,
  CENSORED_IMG_MARK,
} from '../../constants'

import { shouldIgnoreElement } from './serialize'
import { getCensorshipLevel } from './serializationUtils'

// PRIVACY_INPUT_TYPES_TO_IGNORE defines the input types whose input
// events we want to ignore by default, as they often contain PII.
// TODO: We might want to differentiate types to fully ignore vs types
// to obfuscate.
const PRIVACY_INPUT_TYPES_TO_IGNORE = ['email', 'password', 'tel']

const MASKING_CHAR = '᙮'

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
    // TODO: Whatabout handling FORM type?
    return censorshipLevel === CensorshipLevel.PRIVATE
  } else if (node.nodeType === Node.DOCUMENT_NODE) {
    const censorshipLevel = getCensorshipLevel()
    return censorshipLevel === CensorshipLevel.PRIVATE
  }
  return false
}

export function getAttributesForPrivacyLevel(
  element: Element,
  nodePrivacyLevel: NodeCensorshipTag
): Record<string, string | number | boolean> {
  /*
    NEVER ALLOW	`value` under these conditions
    input[type=password]	
    input[autocomplete=cc-number/cc-csc/cc-exp/cc-exp-month/cc-exp-year]	
  */
  if (nodePrivacyLevel === NodeCensorshipTag.HIDDEN) {
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

  if (nodePrivacyLevel === NodeCensorshipTag.MASK) {
    // Mask Attribute text content
    if (safeAttrs.title) {
      safeAttrs.title = CENSORED_STRING_MARK
    }
    if (safeAttrs.alt) {
      safeAttrs.alt = CENSORED_STRING_MARK
    }

    // mask image URLs
    if (tagName === 'IMG' || tagName === 'source') {
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
      if (attrName.startsWith('data-') && attrVal) {
        safeAttrs[attrName] = CENSORED_STRING_MARK
      }
    }
  }
  return safeAttrs
}

/**
 * If a node has no explicit censorship tag, we may apply sensible defaults
 * on a best efforts basis. By spec, we should allow these defaults to evolve over time
 * in an effort to have customers apply their own tags without worrying about defaults changing
 */
function handleNotSetDefaults(node: Node) {
  const censorshipLevel = getCensorshipLevel()
  if (censorshipLevel === CensorshipLevel.PUBLIC) {
    return NodeCensorshipTag.ALLOW
  } else if (censorshipLevel === CensorshipLevel.PRIVATE) {
    return NodeCensorshipTag.MASK
  } else if (censorshipLevel === CensorshipLevel.FORMS) {
    return isFormElement(node)
      ? NodeCensorshipTag.MASK // TODO: HIDDEN?
      : NodeCensorshipTag.ALLOW
  }
  return NodeCensorshipTag.MASK
}

function getNodeSelfCensorshipLevel(node: Node | null): NodeCensorshipTag {
  if (!node) {
    return NodeCensorshipTag.UNKNOWN
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const elNode = node as HTMLElement
    const privAttr = elNode.getAttribute(PRIVACY_ATTR_NAME)

    switch (privAttr) {
      case PRIVACY_ATTR_VALUE_ALLOW:
        return NodeCensorshipTag.ALLOW
      case PRIVACY_ATTR_VALUE_MASK:
        return NodeCensorshipTag.MASK
      case PRIVACY_ATTR_VALUE_HIDDEN:
        return NodeCensorshipTag.HIDDEN
      case PRIVACY_ATTR_VALUE_MASK_SEALED:
        return NodeCensorshipTag.MASK_SEALED
    }

    if (elNode.classList.contains(PRIVACY_CLASS_ALLOW)) {
      return NodeCensorshipTag.ALLOW
    } else if (elNode.classList.contains(PRIVACY_CLASS_HIDDEN)) {
      return NodeCensorshipTag.HIDDEN
    } else if (shouldIgnoreElement(elNode)) {
      // such as for scripts
      return NodeCensorshipTag.IGNORE
    }
  } else if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentNode) {
      return getNodeSelfCensorshipLevel(node.parentNode)
    }
    // We don't know what the censorship level is here
    return NodeCensorshipTag.UNKNOWN
  } else if (node.nodeType === Node.DOCUMENT_NODE) {
    return NodeCensorshipTag.NOT_SET
  }
  return NodeCensorshipTag.NOT_SET
}

/**
 * Checks DOM from top down for first explicit set of `dd-allow` or `dd-block` (or synonyms)
 * if no explicit value has been set, we fallback based on `censorshipLevel`
 * For modes 'PRIVATE' | 'PUBLIC', return a simple true and false respectively
 * For mode 'FORM', we return false if the node is part of the form family (input,textarea etc.)
 */
export function getNodeInheritedCensorshipLevel(
  node: Node
): NodeCensorshipTag.IGNORE | NodeCensorshipTag.ALLOW | NodeCensorshipTag.MASK | NodeCensorshipTag.HIDDEN {
  let inherited = NodeCensorshipTag.NOT_SET
  const ancestors = []
  let nodeItr = node as (Node & ParentNode) | null
  while (nodeItr) {
    // TODO: we can probably have more intelligent rules here- if hidden or block-sealed, return early.
    ancestors.push(nodeItr)
    nodeItr = nodeItr.parentNode
  }
  ancestors.reverse()

  // TODO: These rules can be preplaced with a reducer helper to cleanly determine how rules should be inheritied.
  for (const ancestorNode of ancestors) {
    const nodeSelfCensorshipLevel = getNodeSelfCensorshipLevel(ancestorNode)
    // No Override
    if (nodeSelfCensorshipLevel === NodeCensorshipTag.MASK_SEALED) {
      return NodeCensorshipTag.MASK
    }
    // TODO: Review spec? No override?
    else if (nodeSelfCensorshipLevel === NodeCensorshipTag.IGNORE) {
      return NodeCensorshipTag.IGNORE
    }
    // These fields may be overrided
    else if (
      nodeSelfCensorshipLevel === NodeCensorshipTag.ALLOW ||
      nodeSelfCensorshipLevel === NodeCensorshipTag.MASK ||
      nodeSelfCensorshipLevel === NodeCensorshipTag.HIDDEN
    ) {
      inherited = nodeSelfCensorshipLevel
    }
    // TODO: Lint fix, dont need to reset
    else if (nodeSelfCensorshipLevel === NodeCensorshipTag.NOT_SET) {
      inherited = NodeCensorshipTag.NOT_SET
    } else if (nodeSelfCensorshipLevel === NodeCensorshipTag.UNKNOWN && inherited === NodeCensorshipTag.NOT_SET) {
      inherited = NodeCensorshipTag.UNKNOWN
    }
  }

  // Now that we have an inherited value, we handle fallbacks
  if (inherited === NodeCensorshipTag.UNKNOWN) {
    // Fallback to `MASK` to be extra safe, should never occur
    // TODO: START LOOSE, THEN BECOME STRICT
    return NodeCensorshipTag.HIDDEN
  }

  // These values should not be utilized by child elements
  // Because these fallback choices do not apply to them
  if (inherited === NodeCensorshipTag.NOT_SET) {
    return handleNotSetDefaults(node)
  }

  return inherited
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

/**
 * Returns the given node input privacy mode. The ancestor input privacy mode is required to make
 * sure we respect the privacy mode priorities.
 */
export function getNodeInputPrivacyMode(node: Node, ancestorInputPrivacyMode: InputPrivacyMode): InputPrivacyMode {
  // Non-Elements (like Text Nodes) don't have `input` values.
  if (!isElement(node)) {
    return InputPrivacyMode.NONE
  }

  const attribute = node.getAttribute(PRIVACY_ATTR_NAME)
  if (
    ancestorInputPrivacyMode === InputPrivacyMode.IGNORED ||
    attribute === PRIVACY_ATTR_VALUE_INPUT_IGNORED ||
    node.classList.contains(PRIVACY_CLASS_INPUT_IGNORED) ||
    (isInputElement(node) && PRIVACY_INPUT_TYPES_TO_IGNORE.includes(node.type))
  ) {
    return InputPrivacyMode.IGNORED
  }

  // TODO: REVIEW: Is masking stronger than IGNORE? IF so this should be above the ignored part.
  if (
    ancestorInputPrivacyMode === InputPrivacyMode.MASKED ||
    attribute === PRIVACY_ATTR_VALUE_INPUT_MASKED ||
    node.classList.contains(PRIVACY_CLASS_INPUT_MASKED)
  ) {
    return InputPrivacyMode.MASKED
  }

  return InputPrivacyMode.NONE
}

/**
 * Returns the given node input privacy mode. This function is costly because it checks all of the
 * node ancestors.
 */
export function getNodeOrAncestorsInputPrivacyMode(node: Node): InputPrivacyMode {
  // We basically iterate ancestors from top (document) to bottom (node). It is way easier to do
  // recursively.
  const ancestorInputPrivacyMode = node.parentNode
    ? getNodeOrAncestorsInputPrivacyMode(node.parentNode)
    : InputPrivacyMode.NONE // TODO: SPEC CLARIFICATION: This is the initial part.
  return getNodeInputPrivacyMode(node, ancestorInputPrivacyMode)
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isInputElement(elem: Element): elem is HTMLInputElement {
  return elem.tagName === 'INPUT'
}

export const censorText = (text: string) => text.replace(/[^\s]/g, MASKING_CHAR)

function isFormElement(node: Node | null): boolean {
  if (!node || node.nodeType !== node.ELEMENT_NODE) {
    return false
  }
  const element = node as HTMLInputElement
  return !!FORM_PRIVATE_TAG_NAMES[element.tagName]
}

export function shuffle<T>(array: T[]) {
  // COPYRIGHT: This function code from Mike Bostock https://bost.ocks.org/mike/shuffle/
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

;(window as any).getNodeInheritedCensorshipLevel = getNodeInheritedCensorshipLevel
