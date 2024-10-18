import { getEventSource, type SdkEvent } from '../../sdkEvent'
import { createLogger } from '../../../common/logger'
import { FACET_ROOT } from '../../facets.constants'
import type { FacetValue, FieldPath, FieldMultiValue, FieldValue } from '../../facets.constants'

const logger = createLogger('facetRegistry')

type FacetValueCounts = Map<FieldPath, Map<FacetValue, number>>
type EventFields = Map<FieldPath, FieldMultiValue>

export class FacetRegistry {
  facetValueCounts: FacetValueCounts = new Map()
  eventFieldsCache: WeakMap<SdkEvent, EventFields> = new WeakMap()
  allEventFieldPaths: Set<FieldPath> = new Set()

  addEvent(event: SdkEvent) {
    const fields = getAllFields(event)
    fields.set('$eventSource', getEventSource(event))
    this.eventFieldsCache.set(event, fields)

    incrementFacetValueCounts(fields, this.facetValueCounts)
    fields.forEach((_value, fieldPath) => {
      this.allEventFieldPaths.add(fieldPath)
    })
  }

  getFieldValueForEvent(event: SdkEvent, fieldPath: FieldPath): FieldMultiValue | undefined {
    return this.eventFieldsCache.get(event)?.get(fieldPath)
  }

  getFacetValueCounts(fieldPath: FieldPath): Map<FacetValue, number> {
    return this.facetValueCounts.get(fieldPath) || new Map<FacetValue, number>()
  }

  getAllFieldPaths() {
    return this.allEventFieldPaths
  }

  getFacetChildrenValues(fieldPath: FieldPath): FacetValue[] {
    const facetValues = this.facetValueCounts.get(fieldPath)
    if (!facetValues) {
      return []
    }
    return Array.from(facetValues.keys())
  }

  clear() {
    this.facetValueCounts.clear()
  }
}

/**
 * Increment facet value counts by iterating over all defined facets matching the event fields.
 */
function incrementFacetValueCounts(fields: EventFields, facetValueCounts: FacetValueCounts, facet = FACET_ROOT) {
  const fieldValue = fields.get(facet.path)
  if (typeof fieldValue !== 'string') {
    return
  }

  let valueCounts = facetValueCounts.get(facet.path)
  if (!valueCounts) {
    valueCounts = new Map()
    facetValueCounts.set(facet.path, valueCounts)
  }
  valueCounts.set(fieldValue, (valueCounts.get(fieldValue) ?? 0) + 1)

  if (facet.values?.[fieldValue]?.facets) {
    for (const childFacet of facet.values[fieldValue].facets) {
      incrementFacetValueCounts(fields, facetValueCounts, childFacet)
    }
  }
}

/**
 * Get all event fields indexed by their path. Intermediary fields are also taken into account.
 *
 * @example
 *
 * Simple field:
 *
 *   getAllFields({ foo: 'bar' })
 *   => Map { 'foo' => 'bar' }
 *
 * Event with an intermediary field:
 *
 *   getAllFields({ foo: { bar: 'baz' } })
 *   => Map {
 *     'foo' => { bar: 'baz' },
 *     'foo.bar' => 'baz'
 *   }
 *
 * Event with an array containing plain values:
 *
 *   getAllFields({ foo: ['bar', 'baz'] })
 *   => Map { 'foo' => ['bar', 'baz'] }
 *
 * Event with an array containing nested values:
 *
 *   getAllFields({ foo: [ { bar: 1 }, { bar: 2 } ] })
 *   => Map {
 *     'foo' => [ { bar: 1 }, { bar: 2 } ],
 *     'foo.bar' => [1, 2]
 *   }
 */
export function getAllFields(event: object) {
  const fields: EventFields = new Map()

  getAllFieldsRecursively(event, undefined)

  return fields

  function getAllFieldsRecursively(value: unknown, path: string | undefined) {
    if (Array.isArray(value)) {
      // Recurse inside arrays. The path does not change for array items.
      for (const item of value) {
        getAllFieldsRecursively(item, path)
      }
    } else if (typeof value === 'object' && value !== null) {
      if (path !== undefined) {
        // Store the intermediary field
        pushField(path, value)
      }
      // Recurse inside objects, building the path on the way
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const itemPath = path === undefined ? key : `${path}.${key}`
          const itemValue = (value as { [key: string]: unknown })[key]
          getAllFieldsRecursively(itemValue, itemPath)
        }
      }
    } else if (
      path !== undefined &&
      (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null)
    ) {
      // Store the field
      pushField(path, value)
    } else {
      // Coherence check, it should not happen because events are JSON-encoded so value types are
      // limited.
      logger.error(`Unexpected value type at ${path || '<root>'}`, value)
    }
  }

  /**
   * Add the value to the fields map. If a value is already defined for the given path, store it as
   * an array to reflect all possible values for that path.
   */
  function pushField(path: FieldPath, value: FieldValue) {
    const previousValue = fields.get(path)
    if (Array.isArray(previousValue)) {
      previousValue.push(value)
    } else if (previousValue !== undefined) {
      fields.set(path, [previousValue, value])
    } else {
      fields.set(path, value)
    }
  }
}
