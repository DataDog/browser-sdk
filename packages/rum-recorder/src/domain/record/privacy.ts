import {
  CensorshipLevel,
  InputPrivacyMode,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
  PRIVACY_CLASS_HIDDEN,
  PRIVACY_CLASS_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_MASKED,
} from '../../constants'

import {getCensorshipLevel} from './serializationUtils'

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
  }
  else if (node.nodeType === Node.TEXT_NODE) {
    if (node.parentElement) {
      return nodeShouldBeHidden(node.parentElement);
    }
    const censorshipLevel = getCensorshipLevel();
    // TODO: Whatabout handling FORM type?
    return censorshipLevel===CensorshipLevel.PRIVATE;
    
  }
  else if (node.nodeType === Node.DOCUMENT_NODE) {
    const censorshipLevel = getCensorshipLevel();
    return censorshipLevel===CensorshipLevel.PRIVATE;
  }
  return false;
}

// Returns true if the given DOM node should be hidden, recursively
// checking its ancestors.
export function nodeOrAncestorsShouldBeHidden(node: Node | null): boolean {
  if (!node) {
    // Walking up the tree results in a node without a parent so fallback to default
    // Walking down the tree results in no children to fallback to defaul
    const censorshipLevel = getCensorshipLevel();
    return censorshipLevel===CensorshipLevel.PRIVATE;
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

  // TODO: REVIEW: Is masking stronger than IGNORED? IF so this should be above the ignored part.
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

export const censorText = (text: string) => {
  (window as any).censorText = censorText; // TODO: REMOVE
  return text.replace(/[^\s]/g, MASKING_CHAR);
}
