// Represents the path of a field in an event object. The special value '$eventSource' represent the
// event source (rum, logs, ...)
export type FieldPath = string
export type FieldValue = string | number | null | boolean | object
export type FieldMultiValue = FieldValue | FieldValue[]

// For now, facet values are only strings (we don't support number pickers etc.)
export type FacetValue = string

export interface Facet {
  path: string
  label?: string
  values?: {
    [value: FacetValue]:
      | {
          label?: string
          facets?: Facet[]
        }
      | undefined
  }
}

export const FACET_ROOT: Facet = {
  path: '$eventSource',
  values: {
    rum: {
      label: 'RUM',
      facets: [
        {
          path: 'type',
          label: 'Type',
          values: {
            action: {
              facets: [
                {
                  path: 'action.type',
                  label: 'Action Type',
                },
              ],
            },
            error: {
              facets: [
                {
                  path: 'error.source',
                  label: 'Error Source',
                },
              ],
            },
            resource: {
              facets: [
                {
                  path: 'resource.type',
                  label: 'Resource Type',
                },
              ],
            },
          },
        },
      ],
    },
    logs: {
      label: 'Logs',
      facets: [
        {
          path: 'status',
          label: 'Status',
        },

        {
          path: 'origin',
          label: 'Origin',
        },
      ],
    },
    telemetry: {
      label: 'Telemetry',
      facets: [
        {
          path: 'telemetry.type',
          label: 'Type',
        },
        {
          path: 'telemetry.status',
          label: 'Status',
        },
      ],
    },
  },
}
