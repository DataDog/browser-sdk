import { getEventSource, type SdkEvent } from '../../sdkEvent'
import { createLogger } from '../../../common/logger'
import { FACETS, type FacetId, type FacetValue } from '../../facets.constants'

const logger = createLogger('facetRegistry')

type FieldPath = string
type FieldValue = string | number | null | boolean
type FieldMultiValue = FieldValue | FieldValue[]

export class FacetRegistry {
  facetValueCounts: Map<FacetId, Map<FacetValue, number>> = new Map(FACETS.map((facet) => [facet.id, new Map()]))
  eventFacetsCache: WeakMap<SdkEvent, Map<FacetId, FacetValue>> = new WeakMap()

  addEvent(event: SdkEvent) {
    const fields = getAllFields(event)
    const eventSource = getEventSource(event)
    const facetsCache = new Map<FacetId, FacetValue>()

    for (const facet of FACETS) {
      let facetValue: FacetValue
      if (facet.id === '$eventSource') {
        facetValue = eventSource
      } else {
        const [, facetEventSource, fieldPath] = /^\$(\w+)\.(.*)$/.exec(facet.id)!
        if (facetEventSource !== eventSource) {
          continue
        }
        const fieldValue = fields.get(fieldPath)
        if (typeof fieldValue !== 'string') {
          continue
        }
        facetValue = fieldValue
      }

      const valueCounts = this.facetValueCounts.get(facet.id)!
      valueCounts.set(facetValue, (valueCounts.get(facetValue) ?? 0) + 1)

      facetsCache.set(facet.id, facetValue)
    }

    this.eventFacetsCache.set(event, facetsCache)
  }

  getFacetValueForEvent(event: SdkEvent, facetId: FacetId): FacetValue | undefined {
    return this.eventFacetsCache.get(event)?.get(facetId)
  }

  getFacetValueCounts(facetId: FacetId): Map<FacetValue, number> {
    return this.facetValueCounts.get(facetId)!
  }

  clear() {
    this.facetValueCounts = new Map(FACETS.map((facet) => [facet.id, new Map()]))
  }
}

export function getAllFields(event: object) {
  const fields = new Map<FieldPath, FieldMultiValue>()

  getAllFieldsRec(event, undefined)

  return fields

  function getAllFieldsRec(value: unknown, path: string | undefined) {
    if (Array.isArray(value)) {
      for (const item of value) {
        getAllFieldsRec(item, path)
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const key in value) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const itemPath = path === undefined ? key : `${path}.${key}`
          const itemValue = (value as { [key: string]: unknown })[key]
          getAllFieldsRec(itemValue, itemPath)
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
