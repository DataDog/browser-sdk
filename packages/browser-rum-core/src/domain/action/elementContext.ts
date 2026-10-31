import type { Context } from '@datadog/browser-core'
import { sanitize } from '@datadog/browser-core'
import { combine } from '@datadog/js-core/util'
import { getParentElement } from '../../browser/htmlDomUtils'

export interface ElementContext {
  service?: string
  version?: string
  context?: Context
}

interface ElementWithContext extends Element {
  dd_service?: unknown
  dd_version?: unknown
  dd_context?: unknown
}

export function setElementContext(element: ElementWithContext, context: ElementContext) {
  element.dd_service = context.service
  element.dd_version = context.version
  element.dd_context = context.context
}

/** Snapshot metadata before application handlers can remove or modify the target. */
export function getElementContext(target: Element): ElementContext {
  let result: ElementContext = {}
  for (let element: ElementWithContext | null = target; element; element = getParentElement(element)) {
    const attribute = element.getAttribute('data-dd-context')
    if (
      !attribute &&
      element.dd_service === undefined &&
      element.dd_version === undefined &&
      element.dd_context === undefined
    ) {
      continue
    }
    const attributeContext = parseElementContext(attribute)
    // Properties override the attribute on the same element. Descendants override ancestors.
    result = combine(
      attributeContext,
      {
        service: typeof element.dd_service === 'string' ? element.dd_service : undefined,
        version: typeof element.dd_version === 'string' ? element.dd_version : undefined,
        context: isContext(element.dd_context) ? sanitize(element.dd_context) : undefined,
      },
      result
    )
  }
  return result
}

function parseElementContext(attribute: string | null): ElementContext {
  if (attribute) {
    try {
      const value: unknown = JSON.parse(attribute)
      if (isContext(value)) {
        return {
          service: typeof value.service === 'string' ? value.service : undefined,
          version: typeof value.version === 'string' ? value.version : undefined,
          context: isContext(value.context) ? sanitize(value.context) : undefined,
        }
      }
    } catch {
      // Invalid customer metadata must not prevent collecting the click.
    }
  }
  return {}
}

function isContext(value: unknown): value is Context {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
