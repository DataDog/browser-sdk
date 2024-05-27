import type { RefObject } from 'react'
import React, { useState, useEffect } from 'react'
import { Text } from '@mantine/core'
import type { Coordinates } from './drag'
import { initDrag } from './drag'
import type { EventListColumn } from './columnUtils'
import { moveColumn, removeColumn, getColumnTitle } from './columnUtils'
import * as classes from './columnDrag.module.css'

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

  return drag && <DragGhost drag={drag} />
}

function DragGhost({ drag }: { drag: DragState }) {
  return (
    <div
      className={classes.dragGhost}
      data-action={drag.action?.type}
      style={
        {
          '--drag-x': `${drag.position.x}px`,
          '--drag-y': `${drag.position.y}px`,
          '--drag-start-y': `${drag.startPosition.y}px`,
          '--drag-target-top': `${drag.targetRect.top}px`,
          '--drag-target-height': `${drag.targetRect.height}px`,
          '--drag-target-y': `${drag.targetRect.y}px`,
          '--drag-insert-x': drag.action?.type === 'insert' ? `${drag.action.place.xPosition}px` : '0',
        } as React.CSSProperties
      }
    >
      <Text w="bold">{getColumnTitle(drag.column)}</Text>
    </div>
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
  column: EventListColumn
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
      const siblings = Array.from(targetCell.parentElement!.querySelectorAll(':scope > [data-header-cell]'))
      const columnIndex = siblings.indexOf(targetCell)

      state = {
        targetRect: targetCell.getBoundingClientRect(),
        startPosition: position,
        position,
        action: undefined,
        moved: false,
        insertPlaces: siblings.flatMap((sibling, index) => {
          if (sibling === targetCell) {
            return []
          }
          return {
            xPosition: sibling.getBoundingClientRect()[index < columnIndex ? 'left' : 'right'],
            index,
          }
        }),
        column: columns[columnIndex],
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

      state = { ...state, position, action, moved: true }
      onColumnDragStateChanges(state)
    },

    onDrop() {
      if (!state) {
        return
      }

      if (state.action) {
        switch (state.action.type) {
          case 'delete':
            onColumnsChange(removeColumn(columns, state.column))
            break
          case 'insert':
            onColumnsChange(moveColumn(columns, state.column, state.action.place.index))
            break
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
