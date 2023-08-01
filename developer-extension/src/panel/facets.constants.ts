// The facet id is either:
//
// * "$eventSource", in which case it reflects the event source (rum, logs...) and not an actual
//   field
//
// * "$EVENT_SOURCE.EVENT_PATH", where:
//   * EVENT_SOURCE is an event source (rum, logs, ...)
//   * EVENT_PATH is the path of the event field.
export type FacetId = string

// For now, facet values are only strings (we don't support number pickers etc.)
export type FacetValue = string

export interface Facet {
  id: FacetId
  values?: { [value: FacetValue]: { label?: string } }
  label?: string
  parent?: string
}

export const FACETS: Facet[] = [
  {
    id: '$eventSource',
    values: {
      rum: { label: 'RUM' },
      logs: { label: 'Logs' },
      telemetry: { label: 'Telemetry' },
    },
  },
  {
    label: 'Type',
    id: '$rum.type',
    parent: '$eventSource:rum',
  },
  {
    label: 'Action Type',
    id: '$rum.action.type',
    parent: '$rum.type:action',
  },
  {
    label: 'Error Source',
    id: '$rum.error.source',
    parent: '$rum.type:error',
  },
  {
    label: 'Resource Type',
    id: '$rum.resource.type',
    parent: '$rum.type:resource',
  },
  {
    label: 'Status',
    id: '$logs.status',
    parent: '$eventSource:logs',
  },
  {
    label: 'Origin',
    id: '$logs.origin',
    parent: '$eventSource:logs',
  },
  {
    label: 'Type',
    id: '$telemetry.telemetry.type',
    parent: '$eventSource:telemetry',
  },
  {
    label: 'Status',
    id: '$telemetry.telemetry.status',
    parent: '$telemetry.telemetry.type:log',
  },
]
