import type { Pipeline } from '@datadog/core-next'
import { createActivityDetector } from './activityDetector'
import type { ActivityResult } from './activityDetector'
import { createClickChain } from './clickChain'
import type { PendingClick } from './clickChain'
import { computeFrustration } from './computeFrustration'
import type { ClickEvent } from './clickCollector'

interface ActionContexts {
  getCurrentActionIds(): string[]
}

function generateActionId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `action-${Date.now()}-${Math.random()}`
}

function startActionProcessor(pipeline: Pipeline<Record<string, unknown>>): ActionContexts {
  let currentChain: ReturnType<typeof createClickChain> | undefined
  let clickCounter = 0

  // Track event counts for active click actions
  // Note: this is a simplification — only accurate for one active click at a time
  let activeActionErrorCount = 0
  let activeActionResourceCount = 0
  let activeActionLongTaskCount = 0

  // Track currently active action IDs for stamping on error/resource/long_task events
  let currentClickActionId: string | undefined
  const activeManualActionIds = new Map<string, string>()

  pipeline.subscribe('observation:error', () => {
    activeActionErrorCount++
  })
  pipeline.subscribe('observation:resource', () => {
    activeActionResourceCount++
  })
  pipeline.subscribe('observation:long_task', () => {
    activeActionLongTaskCount++
  })

  // --- Click actions ---
  pipeline.subscribe('action:click', (data) => {
    const clickEvent = data as ClickEvent
    const clickId = ++clickCounter

    // Generate action ID immediately so it can be stamped on concurrent events
    const actionId = generateActionId()
    currentClickActionId = actionId

    // Reset event counts for this action
    activeActionErrorCount = 0
    activeActionResourceCount = 0
    activeActionLongTaskCount = 0

    const detector = createActivityDetector(pipeline)

    const pendingClick: Partial<PendingClick> = {
      name: clickEvent.name,
      nameSource: clickEvent.nameSource,
      targetSelector: clickEvent.targetSelector,
      targetWidth: clickEvent.targetWidth,
      targetHeight: clickEvent.targetHeight,
      positionX: clickEvent.positionX,
      positionY: clickEvent.positionY,
      pointerUpDelay: clickEvent.pointerUpDelay,
      startTime: clickEvent.startTime,
      startDate: clickEvent.startDate,
      actionId,
      errorCount: 0,
      resourceCount: 0,
      longTaskCount: 0,
    }

    // Capture the click id in closure to allow future multi-click tracking
    void clickId

    detector.onComplete((result: ActivityResult) => {
      // Clear the current click action ID once activity detection is done
      if (currentClickActionId === actionId) {
        currentClickActionId = undefined
      }

      const completedClick: PendingClick = {
        ...(pendingClick as PendingClick),
        activity: result,
        errorCount: activeActionErrorCount,
        resourceCount: activeActionResourceCount,
        longTaskCount: activeActionLongTaskCount,
      }

      // Try to append to the current chain
      if (currentChain && currentChain.tryAppend(completedClick)) {
        return
      }

      // Start a new chain
      currentChain = createClickChain(completedClick, (clicks) => {
        finalizeChain(clicks)
        currentChain = undefined
      })
    })
  })

  function finalizeChain(clicks: PendingClick[]): void {
    const frustration = computeFrustration(clicks)

    for (const { click, frustrationTypes } of frustration.actions) {
      const observation: Record<string, unknown> = {
        type: 'action',
        date: click.startDate,
        action: {
          id: click.actionId,
          type: 'click',
          target: { name: click.name },
          loading_time: click.activity.hadActivity ? click.activity.endTime! - click.startTime : undefined,
          error: { count: click.errorCount },
          long_task: { count: click.longTaskCount },
          resource: { count: click.resourceCount },
          ...(frustrationTypes.length > 0 && {
            frustration: { type: frustrationTypes },
          }),
        },
        view: { in_foreground: typeof document !== 'undefined' && document.visibilityState === 'visible' },
        _dd: {
          action: {
            target: {
              selector: click.targetSelector,
              width: click.targetWidth,
              height: click.targetHeight,
            },
            name_source: click.nameSource,
            position: { x: click.positionX, y: click.positionY },
            pointer_up_delay: click.pointerUpDelay,
          },
        },
      }
      pipeline.publish('observation:action', observation)
    }
  }

  // --- Manual actions ---
  const trackedActions = new Map<string, { startTime: number; startDate: number; actionId: string }>()

  pipeline.subscribe('action:add_action', (data) => {
    const action = data as { name: string; type?: string; context?: object }
    const observation: Record<string, unknown> = {
      type: 'action',
      date: Date.now(),
      action: {
        id: generateActionId(),
        type: action.type || 'custom',
        target: { name: action.name },
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
      },
      view: { in_foreground: typeof document !== 'undefined' && document.visibilityState === 'visible' },
    }
    if (action.context) {
      observation.context = action.context
    }
    pipeline.publish('observation:action', observation)
  })

  pipeline.subscribe('action:start_action', (data) => {
    const action = data as { name: string; actionKey?: string }
    const key = action.actionKey ?? action.name
    const actionId = generateActionId()
    trackedActions.set(key, { startTime: performance.now(), startDate: Date.now(), actionId })
    activeManualActionIds.set(key, actionId)
  })

  pipeline.subscribe('action:stop_action', (data) => {
    const action = data as { name?: string; actionKey?: string; context?: object }
    const key = action.actionKey ?? action.name ?? ''
    const tracked = trackedActions.get(key)
    if (!tracked) return
    trackedActions.delete(key)
    activeManualActionIds.delete(key)

    const observation: Record<string, unknown> = {
      type: 'action',
      date: tracked.startDate,
      action: {
        id: tracked.actionId,
        type: 'custom',
        target: { name: key },
        loading_time: performance.now() - tracked.startTime,
        error: { count: 0 },
        long_task: { count: 0 },
        resource: { count: 0 },
      },
      view: { in_foreground: typeof document !== 'undefined' && document.visibilityState === 'visible' },
    }
    if (action.context) {
      observation.context = action.context
    }
    pipeline.publish('observation:action', observation)
  })

  return {
    getCurrentActionIds() {
      const ids: string[] = []
      if (currentClickActionId) ids.push(currentClickActionId)
      for (const id of activeManualActionIds.values()) ids.push(id)
      return ids
    },
  }
}

export { startActionProcessor }
export type { ActionContexts }
