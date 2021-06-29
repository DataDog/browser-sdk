import {
  InputPrivacyMode,
  // CensorshipLevel,
  PRIVACY_ATTR_NAME,
  PRIVACY_ATTR_VALUE_HIDDEN,
  PRIVACY_ATTR_VALUE_INPUT_IGNORED,
  PRIVACY_ATTR_VALUE_INPUT_MASKED,
  PRIVACY_CLASS_HIDDEN,
  PRIVACY_CLASS_INPUT_IGNORED,
  PRIVACY_CLASS_INPUT_MASKED,
  FORM_PRIVATE_TAG_NAMES,
} from '../../constants'


const MASKING_CHAR = '᙮'
const MIN_LEN_TO_MASK = 50;
const whitespaceTest = /^\s$/;


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
  return !!FORM_PRIVATE_TAG_NAMES[elem.tagName]
}


/**
 * Scramble text dynamically preserving whitespace and attempts to approximate the same (pixel) text width. For 
 * long strings (over 50 chars) we scramble ~90% of characters to balance privacy with maintaining accurate pixel width.
 * 
 * NOTE: This is not cryptographically secure due to whitespace preservation + char shuffling, 
 * but instead is a "happy medium" that maintains the layout of each HTML element to handle UX usecases. 
 * For web elements that need strong level of privacy, they should be masked to fully block any recording on it.
 * 
 * ROUGH ALGORITHM:
 * A. for short strings under 50 chars: simply return string with all non-whitespace chars masked
 * B. for long strings over 50 chars:
 * 1. iterate through string to collect all non-whitespace characters.
 * 2. reduce + scramble the non-whitespace chars:
 * - i. toLocaleLowerCase
 * - ii. Hide possibly financial /performance data by setting numbers to zero
 * - iii. Add in 10% more MASK_CHARs 
 * - iv. shuffle the chars (after shuffling, some characters get dropped thanks to 10% padding)
 * 3. refill the scrambled chars into the old string maintaining the origional whitespace.
 * 
 * PITFALLS: 
 * 1. Scrambling text provides little censorship for keywords/enums/options
 * where there are only a handful of possible outcomes
 * 2. Random is used for each iteration, over many session replay recordings enough samples could be collected to 
 * statistically rebuild the text. Though with text lengths over 50, the magnitude of samples
 * required is probably unreasonable so hasn't been examined.
 */
export const scrambleText = (text: string) => {
  // For most text, we just mask all non-whitespace
  // But for really long paragraph text, we preserve some of the characters to maintain pixel perfect length
  if (text.length <= MIN_LEN_TO_MASK) {
      return text.replace(/[^\s]/g, MASKING_CHAR);
  }
  const reducedText = text
  .toLocaleLowerCase()
  .replace(/[0-9]/gi, '0') // Hide financial/perf related data
  const reducedChars = Array.from(reducedText);
  const chars = [];
  for (let i=0; i<reducedChars.length; i++) {
      if (!whitespaceTest.test(reducedChars[i])) {
          chars.push(reducedChars[i]);
      }
  }
  // Add 10% length of MASKING_CHAR to hide origonal string length + some of the charset 
  const addRandCharsLength = Math.ceil(reducedChars.length*0.1);
  Array.prototype.push.apply(chars,new Array(addRandCharsLength).fill(MASKING_CHAR));
  shuffle(chars);

  // Now we put the scrambled chars back into the string, around the origional whitespace
  const whitespacedText = [];
  let i = 0;
  while (whitespacedText.length < reducedChars.length) {
      if (whitespaceTest.test(reducedChars[i])) {
          whitespacedText.push(reducedChars[i]);
      }
      else {
          whitespacedText.push(chars.pop());
      }
      i++;
  };
  return whitespacedText.join('');
};

/**
 * Fisher-Yates Algorithm to shuffle an array.
 * Unbiased, linear time efficiency, with constant space.
 */
function shuffle(array: string[]) {
  // https://bost.ocks.org/mike/shuffle/
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
