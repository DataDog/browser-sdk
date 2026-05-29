import type { AiAgentContext } from '@datadog/browser-rum-core'
import type { BrowserRecord } from '../../types'
import { RecordType, IncrementalSource, MouseInteractionType } from '../../types'

const MIN_INTERACTIONS_FOR_ANALYSIS = 10
const METRONOMIC_TIMING_CV_THRESHOLD = 0.15
const MIN_MOUSE_MOVE_TO_CLICK_RATIO = 2

export interface BehavioralSignals {
  mouseMoveCount: number
  touchMoveCount: number
  clickCount: number
  scrollCount: number
  inputCount: number
  clickTimestamps: number[]
  interactionTimestamps: number[]
}

let onBehaviorDetectedCallback: ((context: AiAgentContext) => void) | undefined

export function setAiAgentBehaviorCallback(callback: (context: AiAgentContext) => void) {
  onBehaviorDetectedCallback = callback
}

export function createBehavioralAnalyzer() {
  const onDetected = onBehaviorDetectedCallback
  if (!onDetected) {
    return undefined
  }

  const signals: BehavioralSignals = {
    mouseMoveCount: 0,
    touchMoveCount: 0,
    clickCount: 0,
    scrollCount: 0,
    inputCount: 0,
    clickTimestamps: [],
    interactionTimestamps: [],
  }
  let alreadyDetected = false

  function processRecord(record: BrowserRecord) {
    if (alreadyDetected) {
      return
    }

    if (record.type !== RecordType.IncrementalSnapshot) {
      return
    }

    const data = (record as { data?: { source?: number; type?: number } }).data
    if (!data || data.source === undefined) {
      return
    }

    switch (data.source) {
      case IncrementalSource.MouseMove:
        signals.mouseMoveCount++
        break
      case IncrementalSource.TouchMove:
        signals.touchMoveCount++
        break
      case IncrementalSource.MouseInteraction:
        if (
          data.type === MouseInteractionType.Click ||
          data.type === MouseInteractionType.MouseDown ||
          data.type === MouseInteractionType.TouchStart
        ) {
          signals.clickCount++
          signals.clickTimestamps.push(record.timestamp)
          signals.interactionTimestamps.push(record.timestamp)
        }
        break
      case IncrementalSource.Scroll:
        signals.scrollCount++
        signals.interactionTimestamps.push(record.timestamp)
        break
      case IncrementalSource.Input:
        signals.inputCount++
        signals.interactionTimestamps.push(record.timestamp)
        break
    }

    const totalInteractions = signals.clickCount + signals.inputCount + signals.scrollCount

    if (totalInteractions >= MIN_INTERACTIONS_FOR_ANALYSIS) {
      analyze()
    }
  }

  function analyze() {
    const result = computeBehavioralDetection(signals)
    if (result) {
      alreadyDetected = true
      onDetected!(result)
    }
  }

  return { processRecord }
}

export function computeBehavioralDetection(signals: BehavioralSignals): AiAgentContext | undefined {
  const totalInteractions = signals.clickCount + signals.inputCount + signals.scrollCount
  if (totalInteractions < MIN_INTERACTIONS_FOR_ANALYSIS) {
    return undefined
  }

  const hasPhysicalPresence = signals.mouseMoveCount > 0 || signals.touchMoveCount > 0

  // Activity without any physical presence (no mouse or touch movement at all)
  if (!hasPhysicalPresence) {
    return { detection_method: 'behavioral', behavioral_detection_reason: 'no_physical_presence' }
  }

  // Clicks with too few mouse movements relative to click count
  if (
    signals.clickCount >= MIN_INTERACTIONS_FOR_ANALYSIS &&
    signals.mouseMoveCount < signals.clickCount * MIN_MOUSE_MOVE_TO_CLICK_RATIO
  ) {
    return { detection_method: 'behavioral', behavioral_detection_reason: 'too_few_mouse_movements' }
  }

  // Metronomic interaction timing
  if (signals.interactionTimestamps.length >= MIN_INTERACTIONS_FOR_ANALYSIS) {
    const cv = computeTimingCV(signals.interactionTimestamps)
    if (cv !== undefined && cv < METRONOMIC_TIMING_CV_THRESHOLD) {
      return { detection_method: 'behavioral', behavioral_detection_reason: 'metronomic_interaction' }
    }
  }

  return undefined
}

function computeTimingCV(timestamps: number[]): number | undefined {
  if (timestamps.length < 3) {
    return undefined
  }
  const intervals: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1])
  }
  const mean = intervals.reduce((sum, v) => sum + v, 0) / intervals.length
  if (mean === 0) {
    return undefined
  }
  const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length
  return Math.sqrt(variance) / mean
}
