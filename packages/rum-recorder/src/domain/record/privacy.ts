import {
  InputPrivacyMode,
  CensorshipLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
  PRIVACY_CLASS_HIDDEN,
  PRIVACY_CLASS_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_MASKED,
  FORM_PRIVATE_TAG_NAMES,
} from '../../constants'

import { Configuration } from '../../../../../packages/core/src/domain/configuration'

// PRIVACY_INPUT_TYPES_TO_IGNORE defines the input types whose input
// events we want to ignore by default, as they often contain PII.
// TODO: We might want to differentiate types to fully ignore vs types
// to obfuscate.
const PRIVACY_INPUT_TYPES_TO_IGNORE = ['email', 'password', 'tel']

// Returns true if the given DOM node should be hidden. Ancestors
// are not checked.
export function nodeShouldBeHidden(node: Node): boolean {
  return (
    isElement(node) &&
    (node.getAttribute(PRIVACY_ATTR_NAME) === PRIVACY_ATTR_VALUE_HIDDEN ||
      node.classList.contains(PRIVACY_CLASS_HIDDEN))
  )
}

// Returns true if the given DOM node should be hidden, recursively
// checking its ancestors.
export function nodeOrAncestorsShouldBeHidden(node: Node | null): boolean {
  if (!node) {
    return false
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
    : InputPrivacyMode.NONE
  return getNodeInputPrivacyMode(node, ancestorInputPrivacyMode)
}

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isInputElement(elem: Element): elem is HTMLInputElement {
  return elem.tagName === 'INPUT'
}

/**
 * For CensorshipLevel=FORMS, we should block all form like elements
 */
export function isFormGroupElement(elem: Element): boolean {
  return FORM_PRIVATE_TAG_NAMES[elem.tagName]
}


/**
 * Scramble each "word" in a string, split by any whitespace character.
 * NOTE: This is not cryptographically secure, but a "happy medium" that maintains 
 * the layout of each HTML element to handle UX usecases. for web elements that need
 * strong level of privacy, they should be masked to fully block any recording on it.
 * 
 * ROUGH ALGORITHM:
 * - reduce text charset: alphas are lowercased, numbers set to zero, others set to '*'
 * - sort each word in the string
 * - sort the characters of each word
 * - words with <4 chars get replaced to asterisks
 * - 10% chance of adding a letter
 * - 10% chance of removing a letter
 * - 10% chance of swapping a letter picked from the entire string
 * - NOTE: Each transformation probability is independent
 * 
 * PITFALLS: Scrambling text provides little censorship for keywords/enums/options
 * where there are only a handful of possible outcomes
 * 
 * FUTURE: We could modify Fisher-Yates Algorithm to first pass shuffle only the non-whitespace characters
 * in an array to preserve the text breakpoints. This would provide strong word censorship while maintaining overall 
 * text length, but would change the size of each word a little bit.
 * 
 * FUTURE: We split by any whitespace character and at the end replace with a space character. We should replace with
 * the origional space character, such as a new line. The effect is that CSS `white-space: pre;` isn't preserved.
 */
export const scrambleText = (text: string) => {
  const reducedText = text
    .toLowerCase()
    .replace(/[0-9]/gi, '0')
    .replace(/[^0-9a-u\s]/gi, '*')
    // Drop letters vwxyz (no support for other unicode chars or other rare letters like j+k)
  const words = reducedText.split(/\s/);
  const censoredWords = shuffle(
    words.map(word=>censorWord(word, reducedText))
  );
  
  // Pad the string to handle losing some characters
  const newLength = censoredWords.reduce((sum, word)=>sum+=word.length, 0);
  if (newLength < text.length) {
    censoredWords.push(''.repeat(text.length - newLength));
  }
  // Truncate the string to handle added characthers
  return censoredWords.join(' ').slice(0, text.length);
}


/**
 * Masks word by shuffling letters
 * Masks short words by replacing entirely with '*' chars
 * Masks length by possibly adding or removing one char
 * Masks set of chars by possibly masking one char
 * NOTE: Each transformation probability is independent
 */
function censorWord (word: string, text: string) {
  if (word.length <=3) {
    return word.replace(/./g, '*');
  }
  // Adding another char from the (parent) text increases entropy for large text bodies
  if (Math.random() >= 0.9) {
    const idx = Math.floor(text.length * Math.random());
    const newChar = text[idx];
    word += newChar
  }
  // Mask set of chars somewhat 
  const letters = Array.from(word);
  if (Math.random() >= 0.9) {
    const fromIdx = Math.floor(text.length * Math.random());
    const toIdx = Math.floor(word.length * Math.random());
    letters[toIdx] = text[fromIdx];
  }
  let shuffledLetters = shuffle(letters);
  if (Math.random() >= 0.9) {
    shuffledLetters = shuffledLetters.slice(0,-1);
  }
  return shuffledLetters.join('');
}

/**
 * Fisher-Yates Algorithm to shuffle an array.
 * Unbiased, linear time efficiency, with constant space.
 */
function shuffle(array: string[]) {
  // COPYRIGHT: This function code from Mike Bostock https://bost.ocks.org/mike/shuffle/
  let m = array.length
  let t: string
  let i: number
  while (m) {
    i = Math.floor(Math.random() * m--)
    t = array[m]
    array[m] = array[i]
    array[i] = t
  }
  return array
}
