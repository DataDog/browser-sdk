import { getEventSource, type SdkEvent } from '../../sdkEvent'
import { createLogger } from '../../../common/logger'
import { FACET_ROOT } from '../../facets.constants'
import type { FacetValue, FieldPath, FieldMultiValue } from '../../facets.constants'

const logger = createLogger('facetRegistry')

type FacetValueCounts = Map<FieldPath, Map<FacetValue, number>>
type EventFields = Map<FieldPath, FieldMultiValue>

export class FacetRegistry {
  facetValueCounts: FacetValueCounts = new Map()
  eventFieldsCache: WeakMap<SdkEvent, EventFields> = new WeakMap()

  addEvent(event: SdkEvent) {
    const fields = getAllFields(event)
    fields.set('$eventSource', getEventSource(event))
    this.eventFieldsCache.set(event, fields)

    incrementFacetValueCounts(fields, this.facetValueCounts)
  }

  getFieldValueForEvent(event: SdkEvent, fieldPath: FieldPath): FieldMultiValue | undefined {
    return this.eventFieldsCache.get(event)?.get(fieldPath)
  }

  getFacetValueCounts(fieldPath: FieldPath): Map<FacetValue, number> {
    return this.facetValueCounts.get(fieldPath) || new Map<FacetValue, number>()
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
    for (const childFacet of facet.values[fieldValue]!.facets!) {
      incrementFacetValueCounts(fields, facetValueCounts, childFacet)
    }
  }
}

export function getAllFields(event: object) {
  const fields: EventFields = new Map()

  getAllFieldsRecursively(event, undefined)

  return fields

  function getAllFieldsRecursively(value: unknown, path: string | undefined) {
    if (Array.isArray(value)) {
      for (const item of value) {
        getAllFieldsRecursively(item, path)
      }
    } else if (typeof value === 'object' && value !== null) {
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
      const previousValue = fields.get(path)
      if (Array.isArray(previousValue)) {
        previousValue.push(value)
      } else if (previousValue !== undefined) {
        fields.set(path, [previousValue, value])
      } else {
        fields.set(path, value)
      }
    } else {
      logger.error(`Unexpected value type at ${path || '<root>'}`, value)
    }
  }
}
