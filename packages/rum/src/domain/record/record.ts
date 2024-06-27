import { sendToExtension } from '@datadog/browser-core'
import type { LifeCycle, RumConfiguration, ViewContexts } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../../types'
import * as replayStats from '../replayStats'
import type { Tracker } from './trackers'
import {
  trackFocus,
  trackFrustration,
  trackInput,
  trackMediaInteraction,
  trackMouseInteraction,
  trackMove,
  trackMutation,
  trackScroll,
  trackStyleSheet,
  trackViewEnd,
  trackViewportResize,
} from './trackers'
import { createElementsScrollPositions } from './elementsScrollPositions'
import type { ShadowRootsController } from './shadowRootsController'
import { initShadowRootsController } from './shadowRootsController'
import { startFullSnapshots } from './startFullSnapshots'
import { initRecordIds } from './recordIds'

export interface RecordOptions {
  emit?: (record: BrowserRecord) => void
  configuration: RumConfiguration
  lifeCycle: LifeCycle
  viewContexts: ViewContexts
}

export interface RecordAPI {
  stop: () => void
  flushMutations: () => void
  shadowRootsController: ShadowRootsController
}

export function record(options: RecordOptions): RecordAPI {
  const { emit, configuration, lifeCycle } = options
  // runtime checks for user options
  if (!emit) {
    throw new Error('emit function is required')
  }

  const emitAndComputeStats = (record: BrowserRecord) => {
    emit(record)
    sendToExtension('record', { record })
    const view = options.viewContexts.findView()!
    replayStats.addRecord(view.id)
  }

  const elementsScrollPositions = createElementsScrollPositions()

  const shadowRootsController = initShadowRootsController(configuration, emitAndComputeStats, elementsScrollPositions)

  const styleSheetsCache = new Map()

  const { stop: stopFullSnapshots } = startFullSnapshots(
    elementsScrollPositions,
    shadowRootsController,
    lifeCycle,
    configuration,
    flushMutations,
    (records) => records.forEach((record) => emitAndComputeStats(record)),
    styleSheetsCache
  )

  function flushMutations() {
    shadowRootsController.flush()
    mutationTracker.flush()
  }

  function invalidateCache(ids: Array<{ id: number }>) {
    ids.filter(({ id }) => styleSheetsCache.has(id)).forEach(({ id }) => styleSheetsCache.delete(id))
  }

  const recordIds = initRecordIds()
  const mutationTracker = trackMutation(
    (record) => {
      emitAndComputeStats(record)

      // Invalidate the cache if any change happened on cached link or style stylesheet,
      if (record.data.source === 0) {
        invalidateCache(record.data.adds.map(({ parentId }) => ({ id: parentId })))
        invalidateCache(record.data.attributes)
        invalidateCache(record.data.removes)
      }
    },
    configuration,
    shadowRootsController,
    document
  )

  const trackers: Tracker[] = [
    mutationTracker,
    trackMove(configuration, emitAndComputeStats),
    trackMouseInteraction(configuration, emitAndComputeStats, recordIds),
    trackScroll(configuration, emitAndComputeStats, elementsScrollPositions, document),
    trackViewportResize(configuration, emitAndComputeStats),
    trackInput(configuration, emitAndComputeStats),
    trackMediaInteraction(configuration, emitAndComputeStats),
    trackStyleSheet((record) => {
      emitAndComputeStats(record)

      // Invalidate the cache if any change happened on cached link or style stylesheet,
      if (record.data.source === 8) {
        styleSheetsCache.delete(record.data.id)
      }
    }),
    trackFocus(configuration, emitAndComputeStats),
    trackViewportResize(configuration, emitAndComputeStats),
    trackFrustration(lifeCycle, emitAndComputeStats, recordIds),
    trackViewEnd(lifeCycle, (viewEndRecord) => {
      flushMutations()
      emitAndComputeStats(viewEndRecord)
    }),
  ]

  return {
    stop: () => {
      shadowRootsController.stop()
      trackers.forEach((tracker) => tracker.stop())
      stopFullSnapshots()
      styleSheetsCache.clear()
    },
    flushMutations,
    shadowRootsController,
  }
}
