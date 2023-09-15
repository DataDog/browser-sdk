export type EventListColumn =
  | { type: 'date' }
  | { type: 'description' }
  | { type: 'type' }
  | { type: 'field'; path: string }

export const DEFAULT_COLUMNS: EventListColumn[] = [{ type: 'date' }, { type: 'type' }, { type: 'description' }]

export function includesColumn(existingColumns: EventListColumn[], newColumn: EventListColumn) {
  return existingColumns.some((column) => {
    if (column.type === 'field' && newColumn.type === 'field') {
      return column.path === newColumn.path
    }
    return column.type === newColumn.type
  })
}

export function getColumnTitle(column: EventListColumn) {
  return column.type === 'date'
    ? 'Date'
    : column.type === 'description'
    ? 'Description'
    : column.type === 'type'
    ? 'Type'
    : column.path
}
