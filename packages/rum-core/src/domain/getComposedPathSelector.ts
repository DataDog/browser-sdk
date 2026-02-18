
import { safeTruncate, ONE_KIBI_BYTE, matchList } from '@datadog/browser-core';
import type { MatchOption } from '@datadog/browser-core';
import { STABLE_ATTRIBUTES, isGeneratedValue, getIDSelector, getTagNameSelector } from './getSelectorFromElement'



const FILTERED_TAGNAMES = ['HTML', 'BODY'];

/**
 * arbitrary value, we want to truncate the selector if it exceeds the limit
 */
const CHARACTER_LIMIT = 2 * ONE_KIBI_BYTE; 

/**
 * separator between elements in the selector
 */
const SEPARATOR = ';';

/**
 * suffix to indicate truncation
 */
const TRUNCATION_SUFFIX = '...';

/**
 * Safe attributes that can be collected without PII concerns.
 * These are commonly used for testing, accessibility, and UI identification.
 */
export const SAFE_ATTRIBUTES = STABLE_ATTRIBUTES.concat([
  // Additional safe attributes
  'role', // Accessibility role (button, navigation, etc.)
  'type', // Input type (submit, button, text, etc.)
  'name', // Form element names (typically non-PII)
  'disabled', // Element state
  'readonly', // Element state
  'checked', // Checkbox/radio state
  'selected', // Option state
  'aria-expanded', // Accessibility state
  'aria-selected', // Accessibility state
  'aria-pressed', // Accessibility state
  'aria-checked', // Accessibility state
  'aria-disabled', // Accessibility state
  'aria-hidden', // Accessibility state
  'aria-haspopup', // Accessibility state
  'aria-controls', // Accessibility relationship
  'aria-describedby', // Accessibility relationship
  'aria-labelledby', // Accessibility relationship
  'tabindex', // Focus management
  'contenteditable', // Editable state
  'draggable', // Drag state
  'target', // Link target (_blank, _self, etc.)
  'rel', // Link relationship
  'download', // Download attribute
  'method', // Form method
  'action', // Form action (path only, no query params with PII)
  'enctype', // Form encoding type
  'autocomplete', // Form autocomplete hint
  'inputmode', // Input mode hint
  'enterkeyhint', // Enter key hint
]);

/**
 * Data extracted from an element in the composedPath.
 */
export interface ComposedPathElementData {
  /** The tag name of the element (e.g., 'DIV', 'BUTTON') */
  tagName: string
  /** The element's id attribute, if present */
  id?: string
  /** Array of class names (with duplicates from parents removed) */
  classes: string[]
  /** Safe attributes collected from the element (with duplicate values from parents removed) */
  attributes: Record<string, string>
  /** The 1-based position among all siblings (only set if element has siblings) */
  nthChild?: number
  /** The 1-based position among siblings of the same tag type (only set if not unique of type) */
  nthOfType?: number
}

/**
 * Extracts a selector string from a MouseEvent composedPath.
 *
 * This function:
 * 1. Filters out non-Element items (Document, Window, ShadowRoot)
 * 2. Extracts a selector string from each element
 * 3. Truncates the selector string if it exceeds the character limit
 * 4. Returns the selector string
 *
 * @param composedPath - The composedPath from a MouseEvent
 * @returns A selector string
 */
export function getComposedPathSelector(composedPath: EventTarget[], actionNameAttribute: string | undefined, attributesAllowList: MatchOption[]): string {
  // Filter to only include Element nodes
  const elements = composedPath.filter(isElement).filter((el) => !FILTERED_TAGNAMES.includes(el.tagName))

  if (elements.length === 0) {
    return '';
  }

  const allowedAttributes = [actionNameAttribute ? [actionNameAttribute] : [], SAFE_ATTRIBUTES, attributesAllowList].flat()

  let result: string = '';

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i]
    const elementData = extractRawElementData(element, allowedAttributes)
    const selectorString = getSelectorStringFromComposedPathElementData(elementData);
    const tmpResult = result + selectorString;
    if (tmpResult.length >= CHARACTER_LIMIT) {
      result = safeTruncate(tmpResult, CHARACTER_LIMIT - TRUNCATION_SUFFIX.length, TRUNCATION_SUFFIX);
      break;
    }
    result = tmpResult;
  }

  return result;
}

function getSelectorStringFromComposedPathElementData(elementData: ComposedPathElementData): string {
  let selector = elementData.tagName
  if (elementData.id) {
    selector += elementData.id
  }
  elementData.classes.forEach((c) => {
    selector += `.${CSS.escape(c)}`
  })
  Object.entries(elementData.attributes).forEach(([key, value]) => {
    selector += `[${CSS.escape(key)}="${CSS.escape(value)}"]`
  })
  if (elementData.nthChild) {
    selector += `:nth-child(${elementData.nthChild})`
  }
  if (elementData.nthOfType) {
    selector += `:nth-of-type(${elementData.nthOfType})`
  }
  return selector + SEPARATOR;
}

/**
 * Type guard to check if an EventTarget is an Element.
 */
function isElement(target: EventTarget): target is Element {
  return target instanceof Element
}

/**
 * Extracts raw data from an element without deduplication.
 */
function extractRawElementData(element: Element, allowedAttributes: MatchOption[]): ComposedPathElementData {
  const tagName = getTagNameSelector(element)
  const id = getIDSelector(element)
  const classes = getElementClassList(element)
  const attributes = extractSafeAttributes(element, allowedAttributes)
  const { nthChild, nthOfType } = computePositionData(element)

  return {
    tagName,
    id,
    classes,
    attributes,
    nthChild,
    nthOfType,
  }
}

function getElementClassList(element: Element): string[] {
  return Array.from(element.classList).filter((c) => c.trim() !== '' && !isGeneratedValue(c))
}

/**
 * Computes the nthChild and nthOfType positions for an element.
 *
 * - nthChild: 1-based position among all siblings. Only set if element has siblings.
 * - nthOfType: 1-based position among siblings of the same tag type. Only set if not unique of type.
 */
function computePositionData(element: Element): { nthChild?: number; nthOfType?: number } {
  const parent = element.parentElement
  if (!parent) {
    return {}
  }

  const siblings = Array.from(parent.children)
  const totalSiblings = siblings.length

  // If element is the only child, no position data needed
  if (totalSiblings <= 1) {
    return {}
  }

  // Calculate nthChild (1-based index among all siblings)
  let childIndex = 0
  for (let i = 0; i < siblings.length; i++) {
    if (siblings[i] === element) {
      childIndex = i + 1 // 1-based
      break
    }
  }
  const nthChild: number | undefined = childIndex

  // Calculate nthOfType (1-based index among siblings of the same tag type)
  let nthOfType: number | undefined
  const sameTypeSiblings = siblings.filter((sibling) => sibling.tagName === element.tagName)

  // Only set nthOfType if there are multiple siblings of the same type
  if (sameTypeSiblings.length > 1) {
    let typeIndex = 0
    for (let i = 0; i < sameTypeSiblings.length; i++) {
      if (sameTypeSiblings[i] === element) {
        typeIndex = i + 1 // 1-based
        break
      }
    }
    nthOfType = typeIndex
  }

  return { nthChild, nthOfType }
}

/**
 * Extracts only the safe (allowlisted) attributes from an element.
 */
function extractSafeAttributes(element: Element, allowedAttributes: MatchOption[]): Record<string, string> {
  const result: Record<string, string> = {}

  if (!element.hasAttributes()) {
    return result
  }

  const attributes = Array.from(element.attributes)
  for (const attr of attributes) {
    if(matchList(allowedAttributes, attr.name)) {
      result[attr.name] = CSS.escape(attr.value);
    }
  }

  return result
}