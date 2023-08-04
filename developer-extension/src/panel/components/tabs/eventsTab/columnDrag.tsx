import type { RefObject } from 'react'
import React, { useState, useEffect } from 'react'
import { Box, Text } from '@mantine/core'
import { BORDER_RADIUS } from '../../../uiUtils'
import type { Coordinates } from './drag'
import { initDrag } from './drag'
import type { EventListColumn } from './columnUtils'
import { getColumnTitle } from './columnUtils'
import { HORIZONTAL_PADDING, VERTICAL_PADDING } from './grid'

/** Number of pixel to determine if the cursor is close enough of a position to trigger an action */
const ACTION_DISTANCE_THRESHOLD = 20

export function ColumnDrag({
  headerRowRef,
  columns,
  onColumnsChange,
}: {
  headerRowRef: RefObject<HTMLDivElement>
  columns: EventListColumn[]
  onColumnsChange: (columns: EventListColumn[]) => void
}) {
  const [drag, setDrag] = useState<DragState | null>(null)

  useEffect(() => {
    if (columns.length > 1) {
      const { stop } = initColumnDrag(headerRowRef.current!, setDrag, columns, onColumnsChange)
      return stop
    }
  }, [columns])

  return drag && <DragGhost columns={columns} drag={drag} />
}

function DragGhost({ columns, drag }: { columns: EventListColumn[]; drag: DragState }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        opacity: 0.5,
        borderRadius: BORDER_RADIUS,

        top: drag.targetRect.top,
        height: drag.targetRect.height,
        transform: 'translateX(-50%)',
        left: drag.position.x,
        background: 'grey',

        paddingTop: VERTICAL_PADDING,
        paddingBottom: VERTICAL_PADDING,
        paddingLeft: HORIZONTAL_PADDING,
        paddingRight: HORIZONTAL_PADDING,
        cursor: 'grabbing',

        ...(drag.action?.type === 'insert' && {
          width: 0,
          left: drag.action.place.xPosition,
          background: 'green',
          color: 'transparent',
          paddingRight: 3,
          paddingLeft: 3,
        }),

        ...(drag.action?.type === 'delete' && {
          top: drag.targetRect.y + (drag.position.y - drag.startPosition.y),
          background: 'red',
        }),
      }}
    >
      <Text weight="bold">{getColumnTitle(columns[drag.columnIndex])}</Text>
    </Box>
  )
}

function getClosestCell(target: HTMLElement) {
  if (target.closest('button, .mantine-Popover-dropdown')) {
    return null
  }
  return target.closest('[data-header-cell]')
}

interface DragState {
  targetRect: DOMRect
  startPosition: Coordinates
  position: Coordinates
  action?: DragAction
  moved: boolean
  insertPlaces: Place[]
  columnIndex: number
}

interface Place {
  index: number
  xPosition: number
}

type DragAction = { type: 'delete' } | { type: 'insert'; place: Place }

function initColumnDrag(
  target: HTMLElement,
  onColumnDragStateChanges: (state: DragState | null) => void,
  columns: EventListColumn[],
  onColumnsChange: (columns: EventListColumn[]) => void
) {
  let state: DragState | null = null

  return initDrag({
    target,

    onStart({ target, position }) {
      const targetCell = getClosestCell(target)
      if (!targetCell) {
        return false
      }
      const siblings = Array.from(targetCell.parentElement!.children)
      const columnIndex = siblings.indexOf(targetCell)

      state = {
        targetRect: targetCell.getBoundingClientRect(),
        insertPlaces: siblings.flatMap((sibling, index) => {
          if (sibling === targetCell) {
            return []
          }
          return {
            xPosition: sibling.getBoundingClientRect()[index < columnIndex ? 'left' : 'right'],
            index,
          }
        }),
        startPosition: position,
        position,
        moved: false,
        action: undefined,
        columnIndex,
      }
      onColumnDragStateChanges(state)
    },

    onMove({ position }) {
      if (!state) {
        return
      }
      let action: DragAction | undefined
      if (Math.abs(state.startPosition.y - position.y) > ACTION_DISTANCE_THRESHOLD) {
        action = { type: 'delete' }
      } else {
        const insertPlace = state.insertPlaces.find(
          ({ xPosition }) => Math.abs(position.x - xPosition) < ACTION_DISTANCE_THRESHOLD
        )
        if (insertPlace) {
          action = { type: 'insert', place: insertPlace }
        }
      }

      state = { ...state, action, position, moved: true }
      onColumnDragStateChanges(state)
    },

    onDrop() {
      if (!state) {
        return
      }

      if (state.action) {
        switch (state.action.type) {
          case 'delete': {
            const newColumns = columns.slice()
            newColumns.splice(state.columnIndex, 1)
            onColumnsChange(newColumns)
            break
          }
          case 'insert': {
            const newColumns = columns.slice()
            const [column] = newColumns.splice(state.columnIndex, 1)
            newColumns.splice(state.action.place.index, 0, column)
            onColumnsChange(newColumns)
            break
          }
        }
      }

      state = null
      onColumnDragStateChanges(state)
    },

    onAbort() {
      state = null
      onColumnDragStateChanges(state)
    },
  })
}
