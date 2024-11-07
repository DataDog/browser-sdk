export type EventListColumn =
  | { type: 'date' }
  | { type: 'buttons' }
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

export function addColumn(columns: EventListColumn[], columnToAdd: EventListColumn) {
  return columns.concat(columnToAdd)
}

export function removeColumn(columns: EventListColumn[], columnToRemove: EventListColumn) {
  return columns.filter((column) => columnToRemove !== column)
}

export function moveColumn(columns: EventListColumn[], columnToMove: EventListColumn, index: number) {
  const newColumns = removeColumn(columns, columnToMove)
  newColumns.splice(index, 0, columnToMove)
  return newColumns
}

export function getColumnTitle(column: EventListColumn) {
  return column.type === 'buttons'
  ? 'xxx' :
      column.type === 'date'
    ? 'Date'
    : column.type === 'description'
      ? 'Description'
      : column.type === 'type'
        ? 'Type'
        : column.path
}
